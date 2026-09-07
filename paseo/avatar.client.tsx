import React, { useEffect, useRef } from "react";
import { Animated, Image, View } from "react-native";
import { AVATAR_IMAGES } from "./avatar-images";
import { AVATAR_EYES } from "./avatar-eyes";

export const AVATAR_SHAPES = Object.keys(AVATAR_IMAGES);

// Official Grok Bot avatar colors, extracted from the app.
export const OFFICIAL_COLORS: Record<string, string> = {
  black: "#000000",
  brown: "#936439",
  red: "#FF263C",
  orange: "#FF6700",
  yellow: "#FF9800",
  green: "#00C972",
  cyan: "#00BCA6",
  blue: "#1084FE",
  violet: "#9159FE",
  magenta: "#FF309B",
  gray: "#777777",
};

// Official fallbacks when a bot has no avatar set, extracted from the app:
// shape from w2 by id hash, color from the non-black palette by id hash.
const DERIVED_SHAPES = ["blob", "pebble", "squircle", "tablet", "wedge", "hex", "cloud", "teardrop"];
const DERIVED_COLORS = ["brown", "red", "orange", "yellow", "green", "cyan", "blue", "violet", "magenta", "gray"];

function fnv1a(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash;
}

function shapeHash(input: string): number {
  let e = fnv1a(input) | 0;
  e = Math.imul(e ^ (e >>> 16), 73244475);
  e = Math.imul(e ^ (e >>> 13), 3266489909);
  return (e ^ (e >>> 16)) >>> 0;
}

function seededRandom(seed: number): () => number {
  let e = seed >>> 0;
  return () => {
    e = (e + 1831565813) | 0;
    let n = Math.imul(e ^ (e >>> 15), 1 | e);
    n = (n + Math.imul(n ^ (n >>> 7), 61 | n)) ^ n;
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}

const MUL = Math.imul(1, 2654435769);

function deriveShape(seed: string): string {
  if (!seed) return "blob";
  return DERIVED_SHAPES[shapeHash(seed) % DERIVED_SHAPES.length] ?? "blob";
}

function deriveColor(seed: string): string {
  if (!seed) return "gray";
  const mixed = (fnv1a(seed) ^ MUL) >>> 0;
  const rand = seededRandom((mixed ^ MUL) >>> 0);
  return DERIVED_COLORS[Math.floor(rand() * DERIVED_COLORS.length)] ?? "gray";
}

function useBlink(seed: string): Animated.Value {
  // Resting value 0 keeps the eye holes open; a blink briefly covers them.
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const phase = shapeHash(seed || "ttz") % 3500;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(2400 + phase),
        Animated.timing(value, { toValue: 1, duration: 80, useNativeDriver: true }),
        Animated.timing(value, { toValue: 0, duration: 150, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [seed, value]);
  return value;
}

function useBreathe(seed: string): Animated.Value {
  const value = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const phase = shapeHash("breathe:" + seed) % 2000;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(phase),
        Animated.timing(value, { toValue: 1.025, duration: 1800, useNativeDriver: true }),
        Animated.timing(value, { toValue: 1, duration: 1800, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [seed, value]);
  return value;
}

export function avatarTint(id: string, name: string, color: string | null): string {
  const official = color ? OFFICIAL_COLORS[color] : undefined;
  return official ?? OFFICIAL_COLORS[deriveColor(id || name)] ?? "#777777";
}

export function BotAvatar({ id, name, shape, color, size, status }: {
  id: string;
  name: string;
  shape: string | null;
  color: string | null;
  size: number;
  status?: "working" | "unread" | null;
}) {
  const resolvedShape = (shape && AVATAR_IMAGES[shape] ? shape : null) ?? deriveShape(id || name);
  const resolvedColor = (color && OFFICIAL_COLORS[color] ? color : null) ?? deriveColor(id || name);
  const source = AVATAR_IMAGES[resolvedShape] ?? AVATAR_IMAGES.blob;
  const tint = OFFICIAL_COLORS[resolvedColor] ?? resolvedColor;
  const blink = useBlink(id || name);
  const breathe = useBreathe(id || name);
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    if (status !== "working") {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.35, duration: 700, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);
  const eyes = AVATAR_EYES[resolvedShape];
  return (
    <View
      accessibilityLabel={name + " 头像"}
      style={{ width: size, height: size, flexShrink: 0, alignItems: "center", justifyContent: "center" }}
    >
      <Animated.View style={{ width: size, height: size, transform: [{ scale: breathe }] }}>
        <Image
          source={{ uri: source }}
          resizeMode="contain"
          style={{ width: size, height: size, tintColor: tint }}
        />
        {eyes ? eyes.map((eye, index) => (
          <Animated.View
            key={resolvedShape + index}
            style={{
              position: "absolute",
              left: (eye.x - eye.rx * 1.2) * size,
              top: (eye.y - eye.ry * 1.2) * size,
              width: eye.rx * 2.4 * size,
              height: eye.ry * 2.4 * size,
              borderRadius: eye.rx * 1.2 * size,
              backgroundColor: tint,
              transform: [{ scaleY: blink }],
            }}
          />
        )) : null}
      </Animated.View>
      {status ? (
        <Animated.View
          accessibilityLabel={status === "working" ? "正在处理" : "有未读消息"}
          style={{
            position: "absolute",
            right: -2,
            bottom: -2,
            width: Math.max(7, Math.round(size * 0.3)),
            height: Math.max(7, Math.round(size * 0.3)),
            borderRadius: Math.max(7, Math.round(size * 0.3)) / 2,
            backgroundColor: status === "working" ? "#00C972" : "#1084FE",
            opacity: status === "working" ? pulse : 1,
          }}
        />
      ) : null}
    </View>
  );
}
