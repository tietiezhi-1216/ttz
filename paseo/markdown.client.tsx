import React from "react";
import { Linking, Platform, Pressable, Text, View } from "react-native";
import { useToast } from "@getpaseo/plugin/react-native";
import { copyText } from "./clipboard.client";
import type { PluginSurfaceProps } from "@getpaseo/plugin";
import { parseInline, parseMarkdown, type Block, type Inline } from "./markdown-parse";

type Theme = PluginSurfaceProps["theme"];

function codeFont(): string {
  return Platform.OS === "ios" ? "Menlo" : "monospace";
}

function openLink(url: string): void {
  if (/^(https?:\/\/|mailto:)/.test(url)) {
    Linking.openURL(url).catch(() => undefined);
  }
}

function renderInline(parts: Inline[], theme: Theme, keyBase: string, depth: number): React.ReactNode[] {
  return parts.map((part, index) => {
    const key = keyBase + "-" + index;
    if (part.t === "text") return <Text key={key}>{part.text}</Text>;
    if (part.t === "code") {
      return (
        <Text key={key} style={{ fontFamily: codeFont(), fontSize: 11, backgroundColor: theme.colors.surface2, paddingHorizontal: 3 }}>
          {part.text}
        </Text>
      );
    }
    if (part.t === "link") {
      const inner = depth < 3 ? renderInline(parseInline(part.text), theme, key + "l", depth + 1) : part.text;
      return (
        <Text
          key={key}
          accessibilityRole="link"
          onPress={() => openLink(part.url)}
          style={{ color: theme.colors.accent ?? theme.colors.foreground, textDecorationLine: "underline" }}
        >
          {inner}
        </Text>
      );
    }
    const inner = depth < 3 ? renderInline(parseInline(part.inner), theme, key + "i", depth + 1) : part.inner;
    if (part.t === "b") return <Text key={key} style={{ fontWeight: "700" }}>{inner}</Text>;
    if (part.t === "s") return <Text key={key} style={{ textDecorationLine: "line-through" }}>{inner}</Text>;
    return <Text key={key} style={{ fontStyle: "italic" }}>{inner}</Text>;
  });
}

export function CopyButton({ text, theme, label }: { text: string; theme: Theme; label: string }) {
  const toast = useToast();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => {
        void copyText(text).then((ok) => {
          if (ok) toast.show("已复制");
          else toast.error("复制失败，长按文本复制");
        });
      }}
      hitSlop={8}
      style={{ paddingVertical: 4, paddingHorizontal: 2 }}
    >
      <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10 }}>{label}</Text>
    </Pressable>
  );
}

function renderBlock(block: Block, theme: Theme, size: number, key: string): React.ReactNode {
  if (block.t === "h") {
    const extra = block.level === 1 ? 5 : block.level === 2 ? 3 : block.level === 3 ? 2 : 1;
    return (
      <Text key={key} style={{ color: theme.colors.foreground, fontSize: size + extra, fontWeight: "700" }}>
        {renderInline(parseInline(block.text), theme, key, 0)}
      </Text>
    );
  }
  if (block.t === "code") {
    return (
      <View
        key={key}
        style={{ backgroundColor: theme.colors.surface2, borderWidth: 1, borderColor: theme.colors.border, borderRadius: 6, padding: 8, gap: 6 }}
      >
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <Text style={{ color: theme.colors.foregroundMuted, fontSize: 10, flex: 1 }}>{block.lang || "代码"}</Text>
          <CopyButton text={block.text} theme={theme} label="复制" />
        </View>
        <Text selectable style={{ color: theme.colors.foreground, fontFamily: codeFont(), fontSize: 11, lineHeight: 16 }}>
          {block.text}
        </Text>
      </View>
    );
  }
  if (block.t === "ul" || block.t === "ol") {
    return (
      <View key={key} style={{ gap: 3 }}>
        {block.items.map((item, index) => (
          <View key={key + "-" + index} style={{ flexDirection: "row", gap: 6, paddingLeft: item.indent * 12 }}>
            <Text numberOfLines={1} style={{ color: theme.colors.foregroundMuted, fontSize: size, width: block.t === "ol" ? 28 : 10, flexShrink: 0 }}>
              {block.t === "ol" ? item.marker : "•"}
            </Text>
            <Text style={{ color: theme.colors.foreground, fontSize: size, lineHeight: size + 5, flex: 1 }}>
              {renderInline(parseInline(item.text), theme, key + "-" + index, 0)}
            </Text>
          </View>
        ))}
      </View>
    );
  }
  if (block.t === "quote") {
    return (
      <View key={key} style={{ borderLeftWidth: 2, borderLeftColor: theme.colors.border, paddingLeft: 8 }}>
        <Text style={{ color: theme.colors.foregroundMuted, fontSize: size, lineHeight: size + 5 }}>
          {renderInline(parseInline(block.text), theme, key, 0)}
        </Text>
      </View>
    );
  }
  if (block.t === "hr") {
    return <View key={key} style={{ height: 1, backgroundColor: theme.colors.border, marginVertical: 4 }} />;
  }
  if (block.t === "table") {
    return (
      <View key={key} style={{ gap: 2 }}>
        <View style={{ flexDirection: "row", gap: 6, borderBottomWidth: 1, borderColor: theme.colors.border, paddingBottom: 3 }}>
          {block.head.map((cell, index) => (
            <Text key={key + "h" + index} style={{ color: theme.colors.foreground, fontSize: size - 1, fontWeight: "700", flex: 1 }}>
              {renderInline(parseInline(cell), theme, key + "h" + index, 0)}
            </Text>
          ))}
        </View>
        {block.rows.map((row, index) => (
          <View key={key + "r" + index} style={{ flexDirection: "row", gap: 6 }}>
            {row.map((cell, cellIndex) => (
              <Text key={key + "r" + index + "c" + cellIndex} style={{ color: theme.colors.foregroundMuted, fontSize: size - 1, flex: 1 }}>
                {renderInline(parseInline(cell), theme, key + "r" + index + "c" + cellIndex, 0)}
              </Text>
            ))}
          </View>
        ))}
      </View>
    );
  }
  return (
    <Text key={key} style={{ color: theme.colors.foreground, fontSize: size, lineHeight: size + 5 }}>
      {renderInline(parseInline(block.text), theme, key, 0)}
    </Text>
  );
}

export function Markdown({ text, theme, fontSize }: { text: string; theme: Theme; fontSize?: number }) {
  const size = fontSize === undefined ? 12 : fontSize;
  const blocks = parseMarkdown(text);
  return (
    <View style={{ gap: 6 }}>
      {blocks.map((block, index) => renderBlock(block, theme, size, "m" + index))}
    </View>
  );
}
