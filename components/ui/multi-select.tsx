"use client";

import * as React from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";

export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Select",
  searchPlaceholder = "Search...",
  className,
}: {
  options: string[];
  value: string[];
  onChange: (vals: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);

  const toggle = (opt: string) => {
    const exists = value.includes(opt);
    const next = exists ? value.filter((v) => v !== opt) : [...value, opt];
    onChange(next);
  };

  const clearAll = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange([]);
  };

  const display = React.useMemo(() => {
    if (!value.length) return placeholder;
    if (value.length <= 2) return value.join(", ");
    return `${value.slice(0, 2).join(", ")} +${value.length - 2}`;
  }, [value, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("w-full justify-between", className)}
        >
          <span className={cn("truncate", !value.length && "text-muted-foreground")}>{display}</span>
          <span className="ms-2 flex items-center gap-1">
            {value.length > 0 && (
              <X
                className="h-4 w-4 text-muted-foreground hover:text-foreground"
                onClick={clearAll}
              />
            )}
            <ChevronDown className="h-4 w-4 opacity-60" />
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder={searchPlaceholder} />
          <CommandList>
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => {
                const checked = value.includes(opt);
                return (
                  <CommandItem
                    key={opt}
                    value={opt}
                    onSelect={() => toggle(opt)}
                    className="cursor-pointer"
                  >
                    <div className="mr-2 flex h-4 w-4 items-center justify-center rounded-sm border border-input">
                      {checked && <Check className="h-3 w-3" />}
                    </div>
                    <span>{opt}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export default MultiSelect;
