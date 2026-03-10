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
import type { SynthesisParams } from "@/lib/types";

interface ParamsPanelProps {
  params: SynthesisParams;
  onChange: (params: SynthesisParams) => void;
}

const DEFAULT_PARAMS: SynthesisParams = {
  exaggeration: 0.5,
  cfg_weight: 0.5,
  temperature: 0.8,
  repetition_penalty: 2.0,
  min_p: 0.05,
  top_p: 1.0,
};

interface SliderConfig {
  key: keyof SynthesisParams;
  label: string;
  min: number;
  max: number;
  step: number;
  description: string;
}

const SLIDERS: SliderConfig[] = [
  {
    key: "exaggeration",
    label: "\uAC10\uC815 \uACFC\uC7A5",
    min: 0,
    max: 2,
    step: 0.05,
    description: "\uB0AE\uC744\uC218\uB85D \uD3C9\uD0C4, \uB192\uC744\uC218\uB85D \uADF9\uC801",
  },
  {
    key: "cfg_weight",
    label: "CFG \uAC00\uC774\uB358\uC2A4",
    min: 0,
    max: 1,
    step: 0.05,
    description: "\uB0AE\uC744\uC218\uB85D \uC790\uC5F0\uC2A4\uB7EC\uC6C0, \uB192\uC744\uC218\uB85D \uC815\uBC00 \uC81C\uC5B4",
  },
  {
    key: "temperature",
    label: "\uC628\uB3C4",
    min: 0.1,
    max: 2,
    step: 0.05,
    description: "\uB0AE\uC744\uC218\uB85D \uC77C\uAD00\uC801, \uB192\uC744\uC218\uB85D \uB2E4\uC591",
  },
  {
    key: "repetition_penalty",
    label: "\uBC18\uBCF5 \uC5B5\uC81C",
    min: 1,
    max: 5,
    step: 0.1,
    description: "\uB192\uC744\uC218\uB85D \uBC18\uBCF5 \uC904\uC5B4\uB4EC",
  },
  {
    key: "min_p",
    label: "Min-P",
    min: 0,
    max: 0.5,
    step: 0.01,
    description: "\uCD5C\uC18C \uD655\uB960 \uC784\uACC4\uAC12",
  },
  {
    key: "top_p",
    label: "Top-P",
    min: 0.1,
    max: 1,
    step: 0.05,
    description: "Nucleus \uC0D8\uD50C\uB9C1",
  },
];

function roundTo(value: number, step: number): number {
  const decimals = step.toString().split(".")[1]?.length || 0;
  return Number(value.toFixed(decimals));
}

export default function ParamsPanel({ params, onChange }: ParamsPanelProps) {
  const [open, setOpen] = useState(false);

  const handleSliderChange = useCallback(
    (key: keyof SynthesisParams, value: number) => {
      onChange({ ...params, [key]: value });
    },
    [params, onChange],
  );

  const handleReset = useCallback(() => {
    onChange({ ...DEFAULT_PARAMS });
  }, [onChange]);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <Card className="py-0 gap-0 overflow-hidden">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-5 py-3.5 transition-colors hover:bg-muted/30">
          <span className="text-sm font-semibold text-foreground">
            {"\uACE0\uAE09 \uC124\uC815"}
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
              {SLIDERS.map((cfg) => {
                const val = params[cfg.key];
                const pct =
                  ((val - cfg.min) / (cfg.max - cfg.min)) * 100;

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

            <div className="mt-5 flex justify-end">
              <Button
                onClick={handleReset}
                variant="outline"
                size="sm"
                className="gap-1.5"
              >
                <RotateCcw className="h-3 w-3" />
                {"\uAE30\uBCF8\uAC12\uC73C\uB85C \uCD08\uAE30\uD654"}
              </Button>
            </div>
          </div>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
