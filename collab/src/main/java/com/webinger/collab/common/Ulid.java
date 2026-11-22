package com.webinger.collab.common;

import java.security.SecureRandom;

/** 26-character ULID (Crockford base32): 10 characters of time, 16 random. Public ids in the API. */
public final class Ulid {
    private static final char[] CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ".toCharArray();
    private static final SecureRandom RANDOM = new SecureRandom();

    private Ulid() {}

    public static String next(long epochMillis) {
        char[] out = new char[26];
        long t = epochMillis;
        for (int i = 9; i >= 0; i--) {
            out[i] = CROCKFORD[(int) (t & 31)];
            t >>>= 5;
        }
        for (int i = 10; i < 26; i++) out[i] = CROCKFORD[RANDOM.nextInt(32)];
        return new String(out);
    }
}
