"use client";

import { useState, useCallback } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from "@/components/ui/collapsible";
import type { SynthesisParams, EngineId } from "@/lib/types";

interface ParamsPanelProps {
  params: SynthesisParams;
  onChange: (params: SynthesisParams) => void;
  engineId?: EngineId;
}

export const DEFAULT_PARAMS: SynthesisParams = {
  // Chatterbox
  exaggeration: 0.5,
  cfg_weight: 0.5,
  min_p: 0.05,
  // Shared
  temperature: 0.8,
  repetition_penalty: 2.0,
  top_p: 1.0,
  // Fish Speech
  chunk_length: 200,
};

export const FISH_SPEECH_DEFAULT_PARAMS: Partial<SynthesisParams> = {
  temperature: 0.8,
  repetition_penalty: 1.1,
  top_p: 0.8,
  chunk_length: 200,
};

interface SliderConfig {
  key: keyof SynthesisParams;
  label: string;
  min: number;
  max: number;
  step: number;
  description: string;
}

const CHATTERBOX_SLIDERS: SliderConfig[] = [
  {
    key: "exaggeration",
    label: "감정 과장",
    min: 0,
    max: 2,
    step: 0.05,
    description: "낮을수록 평탄, 높을수록 극적",
  },
  {
    key: "cfg_weight",
    label: "CFG 가이던스",
    min: 0,
    max: 1,
    step: 0.05,
    description: "낮을수록 자연스러움, 높을수록 정밀 제어",
  },
  {
    key: "temperature",
    label: "온도",
    min: 0.1,
    max: 2,
    step: 0.05,
    description: "낮을수록 일관적, 높을수록 다양",
  },
  {
    key: "repetition_penalty",
    label: "반복 억제",
    min: 1,
    max: 5,
    step: 0.1,
    description: "높을수록 반복 줄어듦",
  },
  {
    key: "min_p",
    label: "Min-P",
    min: 0,
    max: 0.5,
    step: 0.01,
    description: "최소 확률 임계값",
  },
  {
    key: "top_p",
    label: "Top-P",
    min: 0.1,
    max: 1,
    step: 0.05,
    description: "Nucleus 샘플링",
  },
];

const FISH_SPEECH_SLIDERS: SliderConfig[] = [
  {
    key: "temperature",
    label: "온도",
    min: 0.1,
    max: 1.5,
    step: 0.05,
    description: "낮을수록 일관적, 높을수록 다양",
  },
  {
    key: "top_p",
    label: "Top-P",
    min: 0.1,
    max: 1,
    step: 0.05,
    description: "Nucleus 샘플링",
  },
  {
    key: "repetition_penalty",
    label: "반복 억제",
    min: 0.9,
    max: 2.0,
    step: 0.05,
    description: "높을수록 반복 줄어듦",
  },
  {
    key: "chunk_length",
    label: "청크 길이",
    min: 100,
    max: 300,
    step: 10,
    description: "문장 단위 처리 길이 (토큰)",
  },
];

function roundTo(value: number, step: number): number {
  const decimals = step.toString().split(".")[1]?.length || 0;
  return Number(value.toFixed(decimals));
}

export default function ParamsPanel({
  params,
  onChange,
  engineId = "chatterbox",
}: ParamsPanelProps) {
  const [open, setOpen] = useState(false);

  const sliders =
    engineId === "fish_speech" ? FISH_SPEECH_SLIDERS : CHATTERBOX_SLIDERS;

  const handleSliderChange = useCallback(
    (key: keyof SynthesisParams, value: number) => {
      onChange({ ...params, [key]: value });
    },
    [params, onChange],
  );

  const handleReset = useCallback(() => {
    if (engineId === "fish_speech") {
      onChange({ ...params, ...FISH_SPEECH_DEFAULT_PARAMS });
    } else {
      onChange({ ...DEFAULT_PARAMS });
    }
  }, [onChange, params, engineId]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="py-0 gap-0 overflow-hidden">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-3.5 transition-colors hover:bg-muted/30">
          <span className="text-sm font-semibold text-foreground">
            고급 설정
          </span>
          <ChevronDown
            className={cn(
              "h-4 w-4 text-muted-foreground transition-transform duration-200",
              open && "rotate-180",
            )}
          />
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t border-border/60 px-5 pb-5 pt-4">
            <div className="grid gap-5 sm:grid-cols-2">
              {sliders.map((cfg) => {
                const val = params[cfg.key];
                const pct = ((val - cfg.min) / (cfg.max - cfg.min)) * 100;

                return (
                  <div key={cfg.key} className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between">
                      <div className="flex flex-col">
                        <span className="text-xs font-medium text-foreground">
                          {cfg.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground/60">
                          {cfg.description}
                        </span>
                      </div>
                      <span className="text-xs font-mono text-violet-600 dark:text-violet-400 tabular-nums">
                        {roundTo(val, cfg.step)}
                      </span>
                    </div>
                    <div className="relative flex items-center h-5">
                      <div className="absolute inset-x-0 h-1.5 rounded-full bg-muted" />
                      <div
                        className="absolute left-0 h-1.5 rounded-full bg-gradient-to-r from-violet-600 to-violet-400"
                        style={{ width: `${pct}%` }}
                      />
                      <input
                        type="range"
                        min={cfg.min}
                        max={cfg.max}
                        step={cfg.step}
                        value={val}
                        onChange={(e) =>
                          handleSliderChange(cfg.key, Number(e.target.value))
                        }
                        className="relative z-10 h-5 w-full cursor-pointer appearance-none bg-transparent accent-violet-500 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-violet-400 [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(139,92,246,0.5)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125 [&::-moz-range-thumb]:h-3.5 [&::-moz-range-thumb]:w-3.5 [&::-moz-range-thumb]:appearance-none [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-violet-400 [&::-moz-range-thumb]:shadow-[0_0_6px_rgba(139,92,246,0.5)] [&::-webkit-slider-runnable-track]:h-0 [&::-moz-range-track]:h-0"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Fish Speech emotion tag hint */}
            {engineId === "fish_speech" && (
              <div className="mt-4 rounded-lg bg-violet-500/5 border border-violet-500/20 px-4 py-3">
                <p className="text-[11px] font-medium text-violet-700 dark:text-violet-300 mb-1.5">
                  감정 태그 사용법
                </p>
                <p className="text-[10px] text-muted-foreground leading-relaxed">
                  텍스트에 인라인으로 삽입:{" "}
                  <span className="font-mono text-violet-600 dark:text-violet-400">
                    [excited]
                  </span>
                  ,{" "}
                  <span className="font-mono text-violet-600 dark:text-violet-400">
                    [whisper]
                  </span>
                  ,{" "}
                  <span className="font-mono text-violet-600 dark:text-violet-400">
                    [laugh]
                  </span>
                  ,{" "}
                  <span className="font-mono text-violet-600 dark:text-violet-400">
                    [pause]
                  </span>
                  ,{" "}
                  <span className="font-mono text-violet-600 dark:text-violet-400">
                    [sad]
                  </span>
                </p>
                <p className="text-[10px] text-muted-foreground mt-1">
                  예:{" "}
                  <span className="font-mono">
                    안녕하세요. [excited] 오늘 정말 좋은 날이에요!
                  </span>
                </p>
              </div>
            )}

            <div className="mt-5 flex justify-end">
              <Button
                onClick={handleReset}
                variant="outline"
                size="sm"
                className="gap-1.5"
              >
                <RotateCcw className="h-3 w-3" />
                기본값으로 초기화
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
