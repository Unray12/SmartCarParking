const RFID_I2C_OPTIONS = [
  ["default", "1"],
  ["extend", "2"]
];

const RFID_LIST_OPTIONS = [
  ["1", "1"],
  ["2", "2"],
  ["3", "3"],
  ["4", "4"],
  ["5", "5"]
];

const RFID_DIGITAL_PIN_OPTIONS = [
  ["D0", "D0"],
  ["D1", "D1"],
  ["D2", "D2"],
  ["D3", "D3"],
  ["D4", "D4"],
  ["D5", "D5"],
  ["D6", "D6"],
  ["D7", "D7"],
  ["D8", "D8"],
  ["D9", "D9"],
  ["D10", "D10"],
  ["D11", "D11"],
  ["D12", "D12"],
  ["D13", "D13"]
];

function importRfidLibrary() {
  Blockly.Python.definitions_.import_rfid = "from rfid import *";
}

function buildRfidTarget(block) {
  importRfidLibrary();
  const bus = block.getFieldValue("BUS");
  return `get_rfid(${bus})`;
}

Blockly.Blocks.configure_i2c2 = {
  init: function() {
    this.jsonInit({
      type: "configure_i2c2",
      message0: "cau hinh RFID extend SCL %1 SDA %2",
      args0: [
        {
          type: "field_dropdown",
          name: "SCL",
          options: RFID_DIGITAL_PIN_OPTIONS
        },
        {
          type: "field_dropdown",
          name: "SDA",
          options: RFID_DIGITAL_PIN_OPTIONS
        }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#00aeae",
      tooltip: "Chon 2 chan Digital de tao bus RFID extend. Nen dat block nay trong khoi khoi dong.",
      helpUrl: ""
    });
  }
};

Blockly.Python.configure_i2c2 = function(block) {
  importRfidLibrary();
  const scl = block.getFieldValue("SCL");
  const sda = block.getFieldValue("SDA");
  return `configure_i2c2("${scl}", "${sda}")\n`;
};

Blockly.Blocks.scan_card = {
  init: function() {
    this.jsonInit({
      type: "scan_card",
      message0: "RFID %1 doc ID the",
      args0: [
        {
          type: "field_dropdown",
          name: "BUS",
          options: RFID_I2C_OPTIONS
        }
      ],
      output: "String",
      colour: "#00aeae",
      tooltip: "Doc gia tri ID tu the RFID tren bus I2C da chon",
      helpUrl: ""
    });
  }
};

Blockly.Python.scan_card = function(block) {
  const code = `${buildRfidTarget(block)}.scan_card()`;
  return [code, Blockly.Python.ORDER_ATOMIC];
};

Blockly.Blocks.scan_and_check = {
  init: function() {
    this.jsonInit({
      type: "scan_and_check",
      message0: "RFID %1 quet va kiem tra the trong danh sach %2",
      args0: [
        {
          type: "field_dropdown",
          name: "BUS",
          options: RFID_I2C_OPTIONS
        },
        {
          type: "field_dropdown",
          name: "LIST_NAME",
          options: RFID_LIST_OPTIONS
        }
      ],
      output: "Boolean",
      colour: "#00aeae",
      tooltip: "Quet the RFID va kiem tra co thuoc danh sach hay khong",
      helpUrl: ""
    });
  }
};

Blockly.Python.scan_and_check = function(block) {
  const listName = block.getFieldValue("LIST_NAME");
  const code = `${buildRfidTarget(block)}.scan_and_check("rfids_${listName}")`;
  return [code, Blockly.Python.ORDER_ATOMIC];
};

Blockly.Blocks.scan_and_add_card = {
  init: function() {
    this.jsonInit({
      type: "scan_and_add_card",
      message0: "RFID %1 quet va them the vao danh sach %2",
      args0: [
        {
          type: "field_dropdown",
          name: "BUS",
          options: RFID_I2C_OPTIONS
        },
        {
          type: "field_dropdown",
          name: "LIST_NAME",
          options: RFID_LIST_OPTIONS
        }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#00aeae",
      tooltip: "Quet the RFID va them the vao danh sach",
      helpUrl: ""
    });
  }
};

Blockly.Python.scan_and_add_card = function(block) {
  const listName = block.getFieldValue("LIST_NAME");
  return `${buildRfidTarget(block)}.scan_and_add_card("rfids_${listName}")\n`;
};

Blockly.Blocks.scan_and_remove_card = {
  init: function() {
    this.jsonInit({
      type: "scan_and_remove_card",
      message0: "RFID %1 quet va xoa the khoi danh sach %2",
      args0: [
        {
          type: "field_dropdown",
          name: "BUS",
          options: RFID_I2C_OPTIONS
        },
        {
          type: "field_dropdown",
          name: "LIST_NAME",
          options: RFID_LIST_OPTIONS
        }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#00aeae",
      tooltip: "Quet the RFID va xoa the khoi danh sach",
      helpUrl: ""
    });
  }
};

Blockly.Python.scan_and_remove_card = function(block) {
  const listName = block.getFieldValue("LIST_NAME");
  return `${buildRfidTarget(block)}.scan_and_remove_card("rfids_${listName}")\n`;
};

Blockly.Blocks.clear_list = {
  init: function() {
    this.jsonInit({
      type: "clear_list",
      message0: "RFID %1 xoa danh sach %2",
      args0: [
        {
          type: "field_dropdown",
          name: "BUS",
          options: RFID_I2C_OPTIONS
        },
        {
          type: "field_dropdown",
          name: "LIST_NAME",
          options: RFID_LIST_OPTIONS
        }
      ],
      previousStatement: null,
      nextStatement: null,
      colour: "#00aeae",
      tooltip: "Xoa danh sach the RFID",
      helpUrl: ""
    });
  }
};

Blockly.Python.clear_list = function(block) {
  const listName = block.getFieldValue("LIST_NAME");
  return `${buildRfidTarget(block)}.clear_list("rfids_${listName}")\n`;
};
