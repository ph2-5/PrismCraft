export const dynamic = "force-static";

import { NextRequest, NextResponse } from "next/server";
import { safeParseJson, sanitizeErrorMessage } from "@/infrastructure/server/api-utils";
import { errorLogger } from "@/shared/error-logger";

interface PlaceholderBinding {
  placeholder: string;
  type: "character" | "scene";
  targetId: string;
}

interface Character {
  id: string;
  name: string;
}

interface Scene {
  id: string;
  name: string;
}

function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function extractPlaceholders(text: string) {
  const charMatches = text.match(/\[角色:(.*?)\]/g) || [];
  const sceneMatches = text.match(/\[场景:(.*?)\]/g) || [];

  const placeholders: Array<{ placeholder: string; type: "character" | "scene" }> = [];

  charMatches.forEach((match) => {
    const name = match.replace(/\[角色:|\]/g, "");
    if (!placeholders.find((p) => p.placeholder === name && p.type === "character")) {
      placeholders.push({ placeholder: name, type: "character" });
    }
  });

  sceneMatches.forEach((match) => {
    const name = match.replace(/\[场景:|\]/g, "");
    if (!placeholders.find((p) => p.placeholder === name && p.type === "scene")) {
      placeholders.push({ placeholder: name, type: "scene" });
    }
  });

  return placeholders;
}

function replacePlaceholders(
  text: string,
  bindings: PlaceholderBinding[],
  characters: Character[],
  scenes: Scene[]
) {
  let result = text;
  bindings.forEach((binding) => {
    if (binding.type === "character") {
      const char = characters.find((c) => c.id === binding.targetId);
      if (char) {
        result = result.replace(
          new RegExp(`\\[角色:${escapeRegExp(binding.placeholder)}\\]`, "g"),
          char.name
        );
      }
    } else {
      const scene = scenes.find((s) => s.id === binding.targetId);
      if (scene) {
        result = result.replace(
          new RegExp(`\\[场景:${escapeRegExp(binding.placeholder)}\\]`, "g"),
          scene.name
        );
      }
    }
  });
  return result;
}

function replaceDirectReferences(text: string, characters: Character[], scenes: Scene[]) {
  let result = text;

  characters.forEach((char) => {
    if (char.name) {
      const regex = new RegExp(
        `@${char.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "g"
      );
      result = result.replace(regex, char.name);
    }
  });

  scenes.forEach((scene) => {
    if (scene.name) {
      const regex = new RegExp(
        `#${scene.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`,
        "g"
      );
      result = result.replace(regex, scene.name);
    }
  });

  return result;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await safeParseJson(request)) as Record<string, any>;
    const { text, bindings = [], characters = [], scenes = [] } = body;

    if (!text) {
      return NextResponse.json(
        { success: false, error: "文本不能为空" },
        { status: 400 }
      );
    }

    // 提取占位符
    const placeholders = extractPlaceholders(text);

    // 替换占位符
    let result = replacePlaceholders(text, bindings, characters, scenes);

    // 替换直接引用
    result = replaceDirectReferences(result, characters, scenes);

    return NextResponse.json({
      success: true,
      data: {
        result,
        placeholders,
      },
    });
  } catch (error) {
    errorLogger.error("[API Replace Placeholders] Error:", error);
    return NextResponse.json(
      { success: false, error: sanitizeErrorMessage(error) },
      { status: 500 }
    );
  }
}
