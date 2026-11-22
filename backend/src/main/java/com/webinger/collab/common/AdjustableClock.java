package com.webinger.collab.common;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/**
 * The app's one clock (UTC): real time plus an offset. The offset stays zero except through the demo-only
 * "Simulate time" control (POST /dev/simulate-time), which moves it forward like the mock's clockOffsetMs.
 * Tests replace it with their own subclass.
 */
public class AdjustableClock extends Clock {
    private volatile Duration offset = Duration.ZERO;

    public void advance(Duration d) {
        offset = offset.plus(d);
    }

    public void reset() {
        offset = Duration.ZERO;
    }

    public Duration offset() {
        return offset;
    }

    @Override
    public Instant instant() {
        return Instant.now().plus(offset);
    }

    @Override
    public ZoneId getZone() {
        return ZoneOffset.UTC;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return this;
    }
}
