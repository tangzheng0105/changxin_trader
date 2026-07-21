import { CandlestickSeries, LineSeries, createChart } from "lightweight-charts";
import { useEffect, useRef } from "react";

function calculateMa60(bars) {
  return bars.flatMap((bar, index) => {
    if (index < 59) return [];
    const average = bars.slice(index - 59, index + 1).reduce((sum, item) => sum + Number(item.close), 0) / 60;
    return [{ time: bar.time, value: average }];
  });
}

function chartTime(value) {
  if (!String(value).includes(" ")) return value;
  return Math.floor(new Date(`${String(value).replace(" ", "T")}:00+08:00`).getTime() / 1000);
}

export default function KlineChart({ bars }) {
  const containerRef = useRef(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !bars.length) return undefined;

    const chart = createChart(container, {
      width: container.clientWidth,
      height: 460,
      layout: { background: { color: "#ffffff" }, textColor: "#606b7a" },
      grid: { vertLines: { color: "#f0f2f5" }, horzLines: { color: "#f0f2f5" } },
      rightPriceScale: { borderColor: "#e4e7ec" },
      timeScale: { borderColor: "#e4e7ec", timeVisible: false },
    });
    const chartBars = bars.map((bar) => ({ ...bar, time: chartTime(bar.time) }));
    const candles = chart.addSeries(CandlestickSeries, {
      upColor: "#cf1322",
      downColor: "#389e0d",
      borderUpColor: "#cf1322",
      borderDownColor: "#389e0d",
      wickUpColor: "#cf1322",
      wickDownColor: "#389e0d",
    });
    const ma60 = chart.addSeries(LineSeries, { color: "#1677ff", lineWidth: 2, title: "MA60" });
    candles.setData(chartBars);
    ma60.setData(calculateMa60(chartBars));
    chart.timeScale().fitContent();

    const resizeObserver = new ResizeObserver(([entry]) => chart.applyOptions({ width: entry.contentRect.width }));
    resizeObserver.observe(container);
    return () => {
      resizeObserver.disconnect();
      chart.remove();
    };
  }, [bars]);

  return <div className="kline-chart" ref={containerRef} />;
}
