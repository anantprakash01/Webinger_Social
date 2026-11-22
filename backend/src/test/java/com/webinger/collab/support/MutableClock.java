package com.webinger.collab.support;

import com.webinger.collab.common.AdjustableClock;

/** A clock tests can move forward, like the mock's clockOffsetMs ("Simulate time"). Reset after each test. */
public class MutableClock extends AdjustableClock {}
