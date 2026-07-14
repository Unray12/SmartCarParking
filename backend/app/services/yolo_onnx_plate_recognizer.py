from __future__ import annotations

import json
from pathlib import Path

import cv2
import numpy as np

from app.core.config import get_settings
from app.services.plate_recognizer import PlateDetection, normalize_plate

try:
    import onnxruntime as ort

    _ORT_OK = True
except ImportError:
    _ORT_OK = False


def _models_root(models_dir: str) -> Path:
    backend_root = Path(__file__).resolve().parents[2]
    return (backend_root / models_dir).resolve()


def _letterbox(img: np.ndarray, new_shape: int, color: tuple[int, int, int] = (114, 114, 114)):
    """Resize + pad giữ tỉ lệ, giống hàm letterbox gốc của YOLOv5."""
    h, w = img.shape[:2]
    r = min(new_shape / h, new_shape / w)
    new_w, new_h = int(round(w * r)), int(round(h * r))
    dw, dh = (new_shape - new_w) / 2, (new_shape - new_h) / 2

    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    top, bottom = int(round(dh - 0.1)), int(round(dh + 0.1))
    left, right = int(round(dw - 0.1)), int(round(dw + 0.1))
    padded = cv2.copyMakeBorder(resized, top, bottom, left, right, cv2.BORDER_CONSTANT, value=color)
    return padded, r, (left, top)


def _xywh2xyxy(x: np.ndarray) -> np.ndarray:
    y = np.copy(x)
    y[:, 0] = x[:, 0] - x[:, 2] / 2
    y[:, 1] = x[:, 1] - x[:, 3] / 2
    y[:, 2] = x[:, 0] + x[:, 2] / 2
    y[:, 3] = x[:, 1] + x[:, 3] / 2
    return y


def _nms(boxes: np.ndarray, scores: np.ndarray, iou_threshold: float) -> list[int]:
    """NMS thuần numpy - tránh phải thêm phụ thuộc ngoài chỉ để lọc box."""
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
    areas = np.maximum(0.0, x2 - x1) * np.maximum(0.0, y2 - y1)
    order = scores.argsort()[::-1]
    keep: list[int] = []
    while order.size > 0:
        i = order[0]
        keep.append(int(i))
        xx1 = np.maximum(x1[i], x1[order[1:]])
        yy1 = np.maximum(y1[i], y1[order[1:]])
        xx2 = np.minimum(x2[i], x2[order[1:]])
        yy2 = np.minimum(y2[i], y2[order[1:]])
        inter = np.maximum(0.0, xx2 - xx1) * np.maximum(0.0, yy2 - yy1)
        iou = inter / (areas[i] + areas[order[1:]] - inter + 1e-9)
        order = order[1:][iou <= iou_threshold]
    return keep


def _decode(output: np.ndarray, conf_thres: float, iou_thres: float) -> list[tuple[np.ndarray, float, int]]:
    """Decode raw output YOLOv5 (1, N, 5+nc) -> list[(box_xyxy, score, class_id)] đã qua NMS theo từng class."""
    preds = output[0]
    obj_conf = preds[:, 4]
    preds = preds[obj_conf > conf_thres]
    if preds.shape[0] == 0:
        return []

    class_confs = preds[:, 5:]
    class_ids = class_confs.argmax(axis=1)
    scores = preds[:, 4] * class_confs.max(axis=1)

    keep_mask = scores > conf_thres
    preds, scores, class_ids = preds[keep_mask], scores[keep_mask], class_ids[keep_mask]
    if preds.shape[0] == 0:
        return []

    boxes_xyxy = _xywh2xyxy(preds[:, :4])

    results: list[tuple[np.ndarray, float, int]] = []
    for cls in np.unique(class_ids):
        cls_mask = class_ids == cls
        cls_boxes = boxes_xyxy[cls_mask]
        cls_scores = scores[cls_mask]
        for idx in _nms(cls_boxes, cls_scores, iou_thres):
            results.append((cls_boxes[idx], float(cls_scores[idx]), int(cls)))
    return results


def _scale_boxes(boxes: np.ndarray, ratio: float, pad: tuple[float, float], orig_shape: tuple[int, int]) -> np.ndarray:
    """Quy đổi box từ tọa độ ảnh letterbox về tọa độ ảnh gốc (đảo ngược _letterbox)."""
    boxes = boxes.copy()
    boxes[:, [0, 2]] -= pad[0]
    boxes[:, [1, 3]] -= pad[1]
    boxes[:, :4] /= ratio
    boxes[:, 0] = boxes[:, 0].clip(0, orig_shape[1])
    boxes[:, 1] = boxes[:, 1].clip(0, orig_shape[0])
    boxes[:, 2] = boxes[:, 2].clip(0, orig_shape[1])
    boxes[:, 3] = boxes[:, 3].clip(0, orig_shape[0])
    return boxes


def _compute_skew_angle(img_bgr: np.ndarray) -> float:
    """Ước lượng góc lệch của biển số qua Hough line trên cạnh viền (giống utils_rotate.compute_skew gốc)."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    gray = cv2.medianBlur(gray, 3)
    edges = cv2.Canny(gray, 30, 100, apertureSize=3)
    h, w = gray.shape[:2]
    lines = cv2.HoughLinesP(edges, 1, np.pi / 180, 30, minLineLength=w / 1.5, maxLineGap=h / 4)
    if lines is None:
        return 0.0

    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        if abs(angle) <= 30:
            angles.append(angle)
    if not angles:
        return 0.0
    return float(np.mean(angles))


def _deskew(img_bgr: np.ndarray) -> np.ndarray | None:
    angle = _compute_skew_angle(img_bgr)
    if abs(angle) < 0.5:
        return None
    h, w = img_bgr.shape[:2]
    center = (w / 2, h / 2)
    matrix = cv2.getRotationMatrix2D(center, angle, 1.0)
    return cv2.warpAffine(img_bgr, matrix, (w, h), flags=cv2.INTER_LINEAR, borderMode=cv2.BORDER_REPLICATE)


def _assemble_plate_text(chars: list[tuple[float, float, float, str]]) -> str:
    """chars: (x_center, y_center, box_height, char). Tự nhận diện biển 1 dòng / 2 dòng như helper.py gốc."""
    if not chars:
        return ""
    chars = sorted(chars, key=lambda c: c[0])
    if len(chars) == 1:
        return chars[0][3]

    x1, y1 = chars[0][0], chars[0][1]
    x2, y2 = chars[-1][0], chars[-1][1]
    avg_h = sum(c[2] for c in chars) / len(chars)

    def line_y(x: float) -> float:
        if x2 == x1:
            return y1
        return y1 + (y2 - y1) * (x - x1) / (x2 - x1)

    is_two_line = any(abs(c[1] - line_y(c[0])) > avg_h * 0.6 for c in chars)
    if not is_two_line:
        return "".join(c[3] for c in chars)

    y_mid = (min(c[1] for c in chars) + max(c[1] for c in chars)) / 2
    top_row = sorted((c for c in chars if c[1] <= y_mid), key=lambda c: c[0])
    bottom_row = sorted((c for c in chars if c[1] > y_mid), key=lambda c: c[0])
    return "".join(c[3] for c in top_row) + "-" + "".join(c[3] for c in bottom_row)


class YoloOnnxPlateRecognizer:
    """
    ANPR 2 giai đoạn (port từ Marsmallotr/License-Plate-Recognition, chạy bằng ONNX Runtime):
    1. YOLOv5 detect vùng biển số (1 class "license_plate").
    2. YOLOv5 thứ 2 detect TỪNG KÝ TỰ như 1 object riêng (không phải OCR đọc chuỗi)
       - chính xác hơn OCR tổng quát vì bộ ký tự biển số cố định (0-9 + ~20 chữ).
    Cả 2 model không có NMS sẵn trong graph ONNX -> tự decode + NMS bằng numpy.
    """

    def __init__(self) -> None:
        if not _ORT_OK:
            raise RuntimeError("onnxruntime chưa được cài (pip install onnxruntime)")

        settings = get_settings()
        models_dir = _models_root(settings.ai_models_dir)
        detector_path = models_dir / settings.plate_detector_model
        ocr_path = models_dir / settings.plate_ocr_model

        if not detector_path.is_file():
            raise FileNotFoundError(f"Không tìm thấy plate detector model: {detector_path}")
        if not ocr_path.is_file():
            raise FileNotFoundError(f"Không tìm thấy plate OCR model: {ocr_path}")

        self._det_session = ort.InferenceSession(str(detector_path), providers=["CPUExecutionProvider"])
        self._ocr_session = ort.InferenceSession(str(ocr_path), providers=["CPUExecutionProvider"])
        self._det_names = self._read_names(self._det_session)
        self._ocr_names = self._read_names(self._ocr_session)

        self._imgsz = settings.plate_detector_imgsz
        self._det_conf = settings.plate_detector_conf
        self._ocr_conf = settings.plate_ocr_conf
        self._iou = 0.45

    @staticmethod
    def _read_names(session: "ort.InferenceSession") -> dict[int, str]:
        raw = session.get_modelmeta().custom_metadata_map.get("names", "{}")
        return {int(k): v for k, v in json.loads(raw).items()}

    def _run(self, session: "ort.InferenceSession", img_bgr: np.ndarray, conf_thres: float) -> list[tuple[np.ndarray, float, int]]:
        letterboxed, ratio, pad = _letterbox(img_bgr, self._imgsz)
        blob = letterboxed[:, :, ::-1].transpose(2, 0, 1).astype(np.float32) / 255.0
        blob = np.expand_dims(blob, axis=0)
        input_name = session.get_inputs()[0].name
        output = session.run(None, {input_name: blob})[0]

        detections = _decode(output, conf_thres, self._iou)
        results = []
        for box, conf, cls in detections:
            scaled = _scale_boxes(box.reshape(1, 4), ratio, pad, img_bgr.shape[:2])[0]
            results.append((scaled, conf, cls))
        return results

    def _read_plate_text(self, plate_crop: np.ndarray) -> tuple[str, float]:
        candidates = [plate_crop]
        deskewed = _deskew(plate_crop)
        if deskewed is not None:
            candidates.append(deskewed)

        best_text, best_conf, best_count = "", 0.0, 0
        for candidate in candidates:
            if candidate.size == 0:
                continue
            char_detections = self._run(self._ocr_session, candidate, self._ocr_conf)
            if not char_detections:
                continue

            chars: list[tuple[float, float, float, str]] = []
            confs: list[float] = []
            for box, conf, cls in char_detections:
                char = self._ocr_names.get(cls, "")
                if not char:
                    continue
                x_center = (box[0] + box[2]) / 2
                y_center = (box[1] + box[3]) / 2
                height = box[3] - box[1]
                chars.append((x_center, y_center, height, char))
                confs.append(conf)

            if not chars:
                continue

            avg_conf = sum(confs) / len(confs)
            # Ưu tiên đọc được NHIỀU ký tự hơn (biển VN luôn 7-9 ký tự); bằng số lượng thì chọn conf cao hơn.
            if len(chars) > best_count or (len(chars) == best_count and avg_conf > best_conf):
                best_text = _assemble_plate_text(chars)
                best_conf = avg_conf
                best_count = len(chars)

        return best_text, best_conf

    def detect(self, frame_bgr: np.ndarray) -> list[PlateDetection]:
        try:
            plate_boxes = self._run(self._det_session, frame_bgr, self._det_conf)
        except Exception:
            return []

        results: list[PlateDetection] = []
        seen: set[str] = set()
        for box, det_conf, _cls in plate_boxes:
            x1, y1, x2, y2 = (int(v) for v in box)
            if x2 <= x1 or y2 <= y1:
                continue
            crop = frame_bgr[max(0, y1):y2, max(0, x1):x2]
            if crop.size == 0:
                continue

            try:
                text, ocr_conf = self._read_plate_text(crop)
            except Exception:
                continue

            plate = normalize_plate(text)
            if not plate or len(plate) < 4 or len(plate) > 12:
                continue
            if not any(c.isdigit() for c in plate[:2]):
                continue
            if plate in seen:
                continue
            seen.add(plate)

            confidence = float(det_conf * ocr_conf) if ocr_conf else float(det_conf)
            results.append(PlateDetection(plate=plate, confidence=confidence))

        return results
