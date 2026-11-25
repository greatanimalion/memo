import { useEffect, useId, useMemo, useState } from "react";
import { Cpu } from "lucide-react";
import { Select } from "antd";
import { useTranslation } from "react-i18next";

import i18n from "@/i18n";
import { cn } from "@/lib/utils";
import { modelOptionLabel, modelOptionName, selectableModelsByCapability, type AiConfig, type ModelCapability } from "@/store/use-config-store";

type ModelPickerProps = {
    config: AiConfig;
    value?: string;
    onChange: (model: string) => void;
    capability?: ModelCapability;
    className?: string;
    fullWidth?: boolean;
    placeholder?: string;
    onMissingConfig?: () => void;
};

type ModelOption = {
    value: string;
    label: string;
    disabled?: boolean;
};

const EMPTY_VALUE = "__empty__";

export function ModelPicker({ config, value, onChange, capability, className, fullWidth = false, placeholder, onMissingConfig }: ModelPickerProps) {
    const { t } = useTranslation();
    const pickerId = useId();
    const [open, setOpen] = useState(false);
    const options = useMemo(() => Array.from(new Set([...(config.channelMode === "local" && !capability ? [value] : []), ...selectableModelsByCapability(config, capability)].filter((model): model is string => Boolean(model)))), [capability, config, value]);
    const current = value || "";
    const pickerPlaceholder = placeholder || t("settingsPanels.model.select");

    useEffect(() => {
        const closeOtherPicker = (event: Event) => {
            if ((event as CustomEvent<string>).detail !== pickerId) setOpen(false);
        };
        window.addEventListener("model-picker-open", closeOtherPicker);
        return () => window.removeEventListener("model-picker-open", closeOtherPicker);
    }, [pickerId]);

    const selectOptions = useMemo<ModelOption[]>(() => {
        if (!options.length) return [{ value: EMPTY_VALUE, label: emptyModelLabel(config, capability), disabled: true }];
        return options.map((model) => ({ value: model, label: modelOptionLabel(config, model) }));
    }, [capability, config, options]);

    return (
        <span className="contents" onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
            <Select
                open={open}
                value={current || undefined}
                options={selectOptions}
                placeholder={pickerPlaceholder}
                className={cn("canvas-composer-model-picker nodrag  nowheel min-w-36", fullWidth ? "w-full" : "max-w-full", className)}
                popupMatchSelectWidth={false}
                styles={{ popup: { root: { zIndex: 1200 } } }}
                prefix={<ModelIcon model={current} />}
                title={current ? modelOptionLabel(config, current) : pickerPlaceholder}
                labelRender={({ value: selected }) => <span className="canvas-model-picker-text block min-w-0 truncate text-left">{modelOptionLabel(config, String(selected ?? ""))}</span>}
                optionRender={(option) => (option.value === EMPTY_VALUE ? <span>{option.label}</span> : <ModelLabel config={config} model={String(option.value)} />)}
                popupRender={(menu) => (
                    <div data-canvas-no-zoom onMouseDown={(event) => event.stopPropagation()} onPointerDown={(event) => event.stopPropagation()}>
                        {menu}
                    </div>
                )}
                onOpenChange={(nextOpen) => {
                    if (nextOpen && !options.length && config.channelMode === "local") onMissingConfig?.();
                    if (nextOpen) window.dispatchEvent(new CustomEvent("model-picker-open", { detail: pickerId }));
                    setOpen(nextOpen);
                }}
                onChange={(next) => {
                    if (next === EMPTY_VALUE) return;
                    onChange(next);
                }}
            />
        </span>
    );
}

function emptyModelLabel(config: AiConfig, capability?: ModelCapability) {
    const label = capability ? i18n.t(`settingsPanels.model.capabilities.${capability}`) : "";
    if (capability && config.models.length) return i18n.t("settingsPanels.model.assign", { capability: label });
    return config.models.length ? i18n.t("settingsPanels.model.noMatch", { capability: label }) : i18n.t("settingsPanels.model.addFirst");
}

function ModelLabel({ config, model }: { config: AiConfig; model: string }) {
    return (
        <span className="flex min-w-0 items-center gap-2">
            <ModelIcon model={model} />
            <span className="truncate">{modelOptionLabel(config, model)}</span>
        </span>
    );
}

function ModelIcon({ model }: { model: string }) {
    const icon = resolveModelIcon(modelOptionName(model));
    return icon ? <img src={icon} alt="" className="size-4 shrink-0 dark:invert" /> : <Cpu className="size-4 shrink-0 opacity-70" />;
}

function resolveModelIcon(model: string) {
    const name = model.toLowerCase();
    if (name.includes("claude") || name.includes("anthropic")) return "/public/icons/claude.svg";
    if (name.includes("gemini") || name.includes("google")) return "/public/icons/gemini.svg";
    if (name.includes("gpt") || name.includes("openai")) return "/public/icons/openai.svg";
    if (name.includes("grok") || name.includes("grok")) return "/public/icons/grok.svg";
    if (name.includes("deepseek") || name.includes("deepseek")) return "/public/icons/deepseek.svg";
    if (name.includes("glm") || name.includes("glm")) return "/public/icons/glm.svg";
    return "";
}
