import time
import _thread

_EVENT_TIMER = const(0)
_EVENT_MESSAGE = const(1)
_EVENT_CONDITION = const(2)

class EventManager:
    def __init__(self):
        self._events = []
        self._ticks = time.ticks_ms()

    def add_timer_event(self, interval, callback):
        if interval == None or interval <= 0 or callback == None:
            return

        self._events.append({"type": _EVENT_TIMER, "last_ticks": 0, "interval": interval, "callback": callback})
    
    def add_condition_event(self, condition, callback):
        if condition == None or callback == None:
            return

        self._events.append({"type": _EVENT_CONDITION, "condition": condition, "callback": callback})
    
    def add_message_event(self, message_index, callback):
        if message_index == None or message_index < 0 or callback == None:
            return

        self._events.append({"type": _EVENT_MESSAGE, "message_index": message_index, "callback": callback})

    def run(self):
        self._ticks = time.ticks_ms()
        for event in self._events:
            if self._check_event(event):
                self._run_event(event)
    
    def broadcast_message(self, message_index):
      for event in self._events:
          if event.get('type') == _EVENT_MESSAGE and event.get('message_index') == message_index:
              self._run_event(event)
    
    def _check_event(self, event):
        if event.get('type') == _EVENT_TIMER:
          # check timing
          if (self._ticks - event.get('last_ticks')) >= event.get('interval'):
            event['last_ticks'] = self._ticks
            return True
        elif event.get('type') == _EVENT_CONDITION and event.get('condition') != None:
          # check condition
          return event.get('condition')()
        else:
          return False

    def _run_event(self, event):
        if event.get('callback') != None:
            _thread.start_new_thread(event.get('callback'), ())
    
    def reset(self):
        self._events = []

event_manager = EventManager()

def unit_test():
    #from yolobit import *
    def on_button_a_pressed():
        global test
        test = True
        #event_manager.broadcast_message(0)

    button_a.on_pressed = on_button_a_pressed

    def on_button_b_pressed():
        global test
        test = False
        #event_manager.broadcast_message(1)

    button_b.on_pressed = on_button_b_pressed

    def callback_timer1():
        print("timer1")

    def callback_timer2():
        print("timer2")

    def callback_message1():
        print("message 1")
        for count in range(10):
            display.show(Image.HEART)
            display.show(Image.HEART_SMALL)

    def callback_message2():
        print("message 2")
        for count in range(10):
            display.set_all('#ff0000')
            time.sleep_ms(1000)
            display.set_all('#000000')
            time.sleep_ms(1000)

    def callback_condition1():
        global test
        test = False
        print("condition 1")
        for count in range(5):
            display.set_all('#00ff00')
            time.sleep_ms(1000)
            display.set_all('#000000')
            time.sleep_ms(1000)

    def callback_condition2():
        global test
        print("condition 2")
        display.set_all('#00ff00')
        time.sleep_ms(1000)
        display.set_all('#000000')
        time.sleep_ms(1000)
    
    event_manager.add_timer_event(1000, callback_timer1)
    event_manager.add_timer_event(2000, callback_timer2)
    event_manager.add_timer_event(0, None) # invalid input
    event_manager.add_message_event(0, callback_message1)
    event_manager.add_message_event(1, callback_message2)
    event_manager.add_condition_event(lambda:test, callback_condition1)
    event_manager.add_condition_event(lambda:accelerometer.is_gesture("tilt_left"), callback_condition2)

    test = False

    while True:
        event_manager.run()
        time.sleep_ms(100)

if __name__ == '__main__':
    unit_test()
