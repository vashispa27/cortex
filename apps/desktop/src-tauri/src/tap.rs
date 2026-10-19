//! Double-tap detection for a single modifier key, kept free of AppKit so it can be tested.
//!
//! A tap is a clean press and release of the trigger key: no other key goes down while it is held
//! (so ⌘C, ⌥-letter and similar shortcuts never count), and no other modifier changes either (so
//! left and right Command pressed together is a chord, not a tap). Two clean taps within
//! `DOUBLE_TAP_WINDOW` make a double tap.
use std::time::{Duration, Instant};

pub const DOUBLE_TAP_WINDOW: Duration = Duration::from_millis(520);

/// Device-specific bits of the raw modifier mask: left/right Control, Shift, Command, Option, and Fn.
const MODIFIER_KEYS: u64 = 0x1 | 0x2 | 0x4 | 0x8 | 0x10 | 0x20 | 0x40 | 0x2000 | 0x80_0000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Event {
    /// A regular key went down.
    KeyDown { code: u16 },
    /// A modifier changed. `flags` is the event's raw modifier mask, which carries a device-specific
    /// bit per physical key (left and right Command are different bits).
    FlagsChanged { code: u16, flags: u64 },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Tap {
    None,
    First,
    Double,
}

#[derive(Debug)]
pub struct Machine {
    code: u16,
    mask: u64,
    enabled: bool,
    down: bool,
    dirty: bool,
    last_tap: Option<Instant>,
}

impl Machine {
    pub const fn new() -> Self {
        Self { code: 61, mask: 0x40, enabled: false, down: false, dirty: false, last_tap: None }
    }

    /// `code` is the trigger's virtual key code and `mask` its device-specific modifier bit.
    pub fn configure(&mut self, code: u16, mask: u64, enabled: bool) {
        *self = Self { code, mask, enabled, ..Self::new() };
    }

    pub fn handle(&mut self, event: Event, now: Instant) -> Tap {
        match event {
            Event::KeyDown { .. } => {
                if self.down {
                    self.dirty = true;
                }
                Tap::None
            }
            Event::FlagsChanged { code, .. } if code != self.code => {
                // Another modifier moved while the trigger is held: a chord.
                if self.down {
                    self.dirty = true;
                }
                Tap::None
            }
            Event::FlagsChanged { flags, .. } => {
                if flags & self.mask != 0 {
                    if !self.down {
                        self.down = true;
                        // Pressing the trigger while another modifier is already held is a chord.
                        self.dirty = flags & MODIFIER_KEYS & !self.mask != 0;
                    }
                    return Tap::None;
                }
                if !self.down {
                    return Tap::None;
                }
                self.down = false;
                if self.dirty || !self.enabled {
                    return Tap::None;
                }
                let double = self.last_tap.is_some_and(|previous| now.duration_since(previous) < DOUBLE_TAP_WINDOW);
                self.last_tap = if double { None } else { Some(now) };
                if double { Tap::Double } else { Tap::First }
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const RIGHT_COMMAND: (u16, u64) = (54, 0x10);
    const LEFT_COMMAND: (u16, u64) = (55, 0x08);

    fn machine() -> Machine {
        let mut machine = Machine::new();
        machine.configure(RIGHT_COMMAND.0, RIGHT_COMMAND.1, true);
        machine
    }
    fn press((code, mask): (u16, u64), others: u64) -> Event { Event::FlagsChanged { code, flags: mask | others | 0x100000 } }
    fn release((code, _): (u16, u64), others: u64) -> Event { Event::FlagsChanged { code, flags: others } }
    fn tap(machine: &mut Machine, at: Instant) -> Tap {
        assert_eq!(machine.handle(press(RIGHT_COMMAND, 0), at), Tap::None);
        machine.handle(release(RIGHT_COMMAND, 0), at + Duration::from_millis(40))
    }

    #[test]
    fn a_clean_double_tap_fires_once() {
        let mut machine = machine();
        let start = Instant::now();
        assert_eq!(tap(&mut machine, start), Tap::First);
        assert_eq!(tap(&mut machine, start + Duration::from_millis(200)), Tap::Double);
        // The pair is consumed: the next tap starts a new one.
        assert_eq!(tap(&mut machine, start + Duration::from_millis(400)), Tap::First);
    }

    #[test]
    fn a_chord_between_taps_does_not_count() {
        let mut machine = machine();
        let start = Instant::now();
        assert_eq!(tap(&mut machine, start), Tap::First);
        // ⌘C: Command down, C down, Command up.
        machine.handle(press(RIGHT_COMMAND, 0), start + Duration::from_millis(150));
        machine.handle(Event::KeyDown { code: 8 }, start + Duration::from_millis(170));
        assert_eq!(machine.handle(release(RIGHT_COMMAND, 0), start + Duration::from_millis(200)), Tap::None);
        // The first tap is still pending, so a clean tap now completes the pair.
        assert_eq!(tap(&mut machine, start + Duration::from_millis(300)), Tap::Double);
    }

    #[test]
    fn two_taps_600_ms_apart_are_two_single_taps() {
        let mut machine = machine();
        let start = Instant::now();
        assert_eq!(tap(&mut machine, start), Tap::First);
        assert_eq!(tap(&mut machine, start + Duration::from_millis(600)), Tap::First);
    }

    #[test]
    fn left_and_right_command_together_is_a_chord() {
        let mut machine = machine();
        let start = Instant::now();
        machine.handle(press(RIGHT_COMMAND, 0), start);
        machine.handle(press(LEFT_COMMAND, RIGHT_COMMAND.1), start + Duration::from_millis(20));
        machine.handle(release(LEFT_COMMAND, RIGHT_COMMAND.1), start + Duration::from_millis(60));
        assert_eq!(machine.handle(release(RIGHT_COMMAND, 0), start + Duration::from_millis(80)), Tap::None);
        // Releasing the right key while the left is still held is not a press of the right key.
        let mut machine = self::machine();
        machine.handle(press(LEFT_COMMAND, 0), start);
        machine.handle(press(RIGHT_COMMAND, LEFT_COMMAND.1), start + Duration::from_millis(20));
        assert_eq!(machine.handle(release(RIGHT_COMMAND, LEFT_COMMAND.1), start + Duration::from_millis(60)), Tap::None);
    }

    #[test]
    fn other_triggers_and_disabled_state_are_ignored() {
        let mut machine = machine();
        let start = Instant::now();
        assert_eq!(machine.handle(press(LEFT_COMMAND, 0), start), Tap::None);
        assert_eq!(machine.handle(release(LEFT_COMMAND, 0), start + Duration::from_millis(30)), Tap::None);
        machine.configure(RIGHT_COMMAND.0, RIGHT_COMMAND.1, false);
        assert_eq!(tap(&mut machine, start), Tap::None);
    }
}
