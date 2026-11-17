import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import * as echarts from "echarts/core";
import { BarChart, CandlestickChart, HeatmapChart, LineChart, RadarChart, ScatterChart, TreemapChart } from "echarts/charts";
import {
  DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, RadarComponent, TooltipComponent, VisualMapComponent,
} from "echarts/components";
import { LabelLayout } from "echarts/features";
import { CanvasRenderer } from "echarts/renderers";
import type { EChartsOption } from "echarts";
type ECharts = echarts.EChartsType;

// Register only what the app uses (keeps the bundle well under the full ECharts build).
echarts.use([
  BarChart, CandlestickChart, HeatmapChart, LineChart, RadarChart, ScatterChart, TreemapChart,
  DataZoomComponent, GridComponent, LegendComponent, MarkLineComponent, RadarComponent, TooltipComponent, VisualMapComponent,
  LabelLayout, CanvasRenderer,
]);
import { useSettings } from "../lib/store";

export interface EChartHandle {
  instance: () => ECharts | null;
}

interface Props {
  option: EChartsOption;
  height?: number | string;
  className?: string;
  onEvents?: Record<string, (p: any) => void>;
  notMerge?: boolean;
}

/** Thin, theme-aware ECharts wrapper with resize handling. */
export const EChart = forwardRef<EChartHandle, Props>(function EChart(
  { option, height = 320, className, onEvents, notMerge = true },
  ref,
) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<ECharts | null>(null);
  const theme = useSettings((s) => s.theme);

  useImperativeHandle(ref, () => ({ instance: () => chart.current }), []);

  useEffect(() => {
    if (!el.current) return;
    const c = echarts.init(el.current, undefined, { renderer: "canvas" });
    chart.current = c;
    const ro = new ResizeObserver(() => !c.isDisposed() && c.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      c.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(option, { notMerge, lazyUpdate: false });
  }, [option, notMerge, theme]);

  useEffect(() => {
    const c = chart.current;
    if (!c || !onEvents) return;
    Object.entries(onEvents).forEach(([k, fn]) => c.on(k, fn));
    return () => {
      Object.keys(onEvents).forEach((k) => c.off(k));
    };
  }, [onEvents]);

  return <div ref={el} className={className} style={{ height, width: "100%" }} />;
});
