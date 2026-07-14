from motor import *
from mdv2 import *
from drivebase import *
from servo import *
from mpu6050 import MPU6050
from angle_sensor import AngleSensor
from ble import *
from gamepad import *
from abutton import *
from pins import *

async def on_cmd_BTN_L1():
  await servo1.run_angle(angle=180, speed=100)

async def on_cmd_BTN_L2():
  await servo1.run_angle(angle=0, speed=100)

async def on_cmd_BTN_R1():
  await servo2.run_angle(angle=100, speed=100)

async def on_cmd_BTN_R2():
  await servo2.run_angle(angle=(-20), speed=100)

async def on_cmd_BTN_THUMBR():
  motor5.run(0)

# các câu lệnh chạy tự động sẽ đặt trong này
async def ch_E1_BA_A1y_t_E1_BB_B1__C4_91_E1_BB_99ng():
  robot.speed(50, min_speed=40)
  await robot.forward_for(50, unit=CM, then=BRAKE)
  await asleep_ms(1000)
  await robot.backward_for(50, unit=CM, then=BRAKE)
  await asleep_ms(1000)
  await robot.turn_left_for(90, unit=DEGREE, then=BRAKE)
  await asleep_ms(1000)
  await robot.turn_right_for(90, unit=DEGREE, then=BRAKE)
  await asleep_ms(1000)
  robot.speed(60, min_speed=40)

async def on_abutton_BOOT_pressed():
  robot.mode_auto = True
  await ch_E1_BA_A1y_t_E1_BB_B1__C4_91_E1_BB_99ng()
  robot.mode_auto = False

md_v2 = MotorDriverV2()
motor1 = DCMotor(md_v2, M1, reversed=True)
motor2 = DCMotor(md_v2, M2, reversed=False)
motor3 = DCMotor(md_v2, E1, reversed=True)
motor4 = DCMotor(md_v2, E2, reversed=True)
robot = DriveBase(MODE_MECANUM, m1=motor2, m2=motor1, m3=motor4, m4=motor3)
servo1 = Servo(md_v2, S1, 180)
servo2 = Servo(md_v2, S2, 180)
servo3 = Servo(md_v2, S3, 180)
servo4 = Servo(md_v2, S4, 180)
motor5 = DCMotor(md_v2, M3, reversed=False)
imu = MPU6050()
angle_sensor = AngleSensor(imu)
gamepad = Gamepad()
btn_BOOT= aButton(BOOT_PIN)
led_D13 = Pins(D13_PIN)

def deinit():
  robot.stop()
  btn_BOOT.deinit()

import yolo_uno
yolo_uno.deinit = deinit

async def task_v_M_x_T():
  while True:
    await asleep_ms(75)
    if gamepad.data[BTN_TRIANGLE] == 1:
      await servo4.run_steps(5)
    if gamepad.data[BTN_CROSS] == 1:
      await servo4.run_steps((-5))
    if gamepad.data[BTN_SQUARE] == 1:
      await servo3.run_steps((-5))
    if gamepad.data[BTN_CIRCLE] == 1:
      await servo3.run_steps(5)
    if (gamepad.data[ARX]) > 50:
      motor5.run(80)
    if (gamepad.data[ARX]) <= -50:
      motor5.run((-80))

async def task_w_F_d_x():
  while True:
    await asleep_ms(1000)
    led_D13.toggle()

async def setup():

  print('App started')
  neopix.show(0, hex_to_rgb('#ff0000'))
  motor3.set_encoder(rpm=350, ppr=11, gears=34)
  motor4.set_encoder(rpm=350, ppr=11, gears=34)
  robot.size(wheel=80, width=400)
  servo1.limit(min=115, max=180)
  servo2.limit(min=115, max=180)
  servo3.limit(min=115, max=180)
  servo4.limit(min=0, max=180)
  angle_sensor.calibrate(250)
  create_task(angle_sensor.run())
  robot.angle_sensor(angle_sensor)
  robot.use_gyro(True)
  robot.speed(60, min_speed=40)
  create_task(ble.wait_for_msg())
  create_task(gamepad.run())
  create_task(robot.run_teleop(gamepad, accel_steps=3))
  neopix.show(0, hex_to_rgb('#4b0082'))
  print((md_v2.battery()))

  robot.on_teleop_command(BTN_L1, on_cmd_BTN_L1)
  robot.on_teleop_command(BTN_L2, on_cmd_BTN_L2)
  robot.on_teleop_command(BTN_R1, on_cmd_BTN_R1)
  robot.on_teleop_command(BTN_R2, on_cmd_BTN_R2)
  robot.on_teleop_command(BTN_THUMBR, on_cmd_BTN_THUMBR)
  btn_BOOT.pressed(on_abutton_BOOT_pressed)
  create_task(task_v_M_x_T())
  create_task(task_w_F_d_x())

async def main():
  await setup()
  while True:
    await asleep_ms(100)

run_loop(main())

