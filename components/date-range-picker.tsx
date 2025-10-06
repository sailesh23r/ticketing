"use client";
import * as React from 'react';
import { addDays, startOfDay, endOfDay } from 'date-fns';
import { Calendar } from '@/components/ui/calendar';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter } from '@/components/ui/card';

export interface DateRangeValue { start: Date; end: Date }
interface Props {
  value: DateRangeValue;
  onChange: (range: DateRangeValue) => void;
  maxSpanDays?: number;
}

export function DateRangePicker({ value, onChange, maxSpanDays = 366 }: Props) {
  const [month, setMonth] = React.useState<Date>(value.start);

  function setPreset(days: number) {
    const end = endOfDay(new Date());
    const start = startOfDay(addDays(end, -days + 1));
    onChange({ start, end });
    setMonth(start);
  }

  // Handler for react-day-picker in range mode
  function handleSelect(range: { from?: Date; to?: Date } | undefined) {
    if (!range?.from) return; // nothing yet
    const start = startOfDay(range.from);
    const end = endOfDay(range.to ?? range.from);
    const spanDays = Math.ceil((end.getTime() - start.getTime()) / 86400000);
    if (spanDays > maxSpanDays) return; // ignore overly large selection
    onChange({ start, end });
    setMonth(start);
  }

  const presets = [
    { label: 'Last 7 days', action: () => setPreset(7) },
    { label: 'Last 30 days', action: () => setPreset(30) },
    { label: 'Last 90 days', action: () => setPreset(90) },
  ];

  return (
    <Card className="w-full max-w-[340px] p-2">
      <CardContent className="px-2 pb-3 pt-2">
        <Calendar
          mode="range"
          selected={{ from: value.start, to: value.end }}
          onSelect={handleSelect}
          defaultMonth={month}
          onMonthChange={setMonth}
          className="bg-transparent p-0 w-full"
          numberOfMonths={1}
        />
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 border-t px-2 pt-3">
        {presets.map(p => (
          <Button key={p.label} variant="outline" size="sm" className="flex-1" onClick={p.action}>{p.label}</Button>
        ))}
        <Button
          variant="secondary"
          size="sm"
          className="flex-1"
          onClick={() => setPreset(7)}
        >Reset</Button>
      </CardFooter>
      
    </Card>
  );
}
