import { Interaction } from 'chart.js';
import { valueOrDefault } from 'chart.js/helpers';

/*eslint no-var: "off"*/

const getXValFromIdx = (idx, ticks, isNumberTicks) => {
  // we pass `isNumberTicks` from outside the `for` cycle, so that we don't have to calculate it on every `getXValFromIdx` call
  if (!isNumberTicks) return idx

  const label = ticks[idx]?.label;

  return typeof label === "number" ? label : idx
};

const getInterpolatedValues = ({ xScale, yScale, xPixelCursor, data, ticks, isNumberTicks, isStepped }) => {
  let index = xScale.getValueForPixel(xPixelCursor);

  if (index <= xScale.min) index = 1;

  const xPixelCurIndex = xScale.getPixelForValue(index);

  if (xPixelCursor > xPixelCurIndex) index = index + 1; // this condition is necessary because of how `xScale.getPixelForValue` is calculated

  if (index > xScale.max) index = xScale.max;

  const x1 = getXValFromIdx(index - 1, ticks, isNumberTicks);
  const x2 = getXValFromIdx(index, ticks, isNumberTicks);

  const y1 = data[index - 1];
  const y2 = data[index];

  const prev = { x: x1, y: y1 };
  const next = { x: x2, y: y2 };

  const xPixel1 = xScale.getPixelForValue(index - 1);
  const xPixel2 = xScale.getPixelForValue(index);

  const relativeOffsetFromPoint1 = (xPixelCursor - xPixel1) / (xPixel2 - xPixel1);

  let xVal = (x2 - x1) * relativeOffsetFromPoint1 + x1;
  let yVal = (y2 - y1) * relativeOffsetFromPoint1 + y1;

  if (isStepped) yVal = xPixelCursor >= xScale.getPixelForValue(xScale.max) ? y2 : y1;

  const firstXVal = index - 1 === xScale.min ? x1 : getXValFromIdx(xScale.min, ticks, isNumberTicks);
  const lastXVal = index === xScale.max ? x2 : getXValFromIdx(xScale.max, ticks, isNumberTicks);

  const firstYVal = yScale.min;
  const lastYVal = yScale.max;

  // because of interpolation inaccuracy `xVal` and `yVal` can get out of bounds of real values, here we fix this
  xVal = Math.max(firstXVal, Math.min(lastXVal, xVal));
  yVal = Math.max(firstYVal, Math.min(lastYVal, yVal));

  return { prev, next, xValueInterpolated: xVal, yValueInterpolated: yVal }
};

function interpolate (chart, e, options) {
  var items = [];
  const ticks = chart?.scales?.x?.ticks;
  const isNumberTicks = Array.isArray(ticks) && ticks.every(it => typeof it.label === "number");

  for (var datasetIndex = 0; datasetIndex < chart.data.datasets.length; datasetIndex++) {
    const dataset = chart.data.datasets[datasetIndex];

    // check for interpolate setting
    if (!dataset.interpolate) {
      continue
    }

    const meta = chart.getDatasetMeta(datasetIndex);

    // do not interpolate hidden charts
    if (meta.hidden) {
      continue
    }

    const xScale = chart.scales[meta.xAxisID];
    const yScale = chart.scales[meta.yAxisID];

    let xValue = xScale.getValueForPixel(e.x);

    if (xValue > xScale.max || xValue < xScale.min) {
      continue
    }

    const data = dataset.data;

    const isCategory = xScale.type === "category";
    const isStepped = dataset.stepped;

    let interpolatedValue, prev, next;
    let index = -1;

    if (isCategory) {
      const res = getInterpolatedValues({
        xScale,
        yScale,
        xPixelCursor: e.x,
        data,
        ticks,
        isNumberTicks,
        isStepped,
      });

      prev = res.prev;
      next = res.next;

      xValue = res.xValueInterpolated;
      interpolatedValue = res.yValueInterpolated;
    } else {
      index = data.findIndex(o => o.x >= xValue);

      if (index === -1) {
        continue
      }

      // linear interpolate value
      prev = data[index - 1];
      next = data[index];
    }

    if (prev && next && !isCategory) {
      const slope = (next.y - prev.y) / (next.x - prev.x);
      interpolatedValue = prev.y + (xValue - prev.x) * slope;
    }

    if (isStepped && prev && !isCategory) {
      interpolatedValue = prev.y;
    }

    if (isNaN(interpolatedValue)) {
      continue
    }

    const yPosition = yScale.getPixelForValue(interpolatedValue);

    // do not interpolate values outside of the axis limits
    if (isNaN(yPosition)) {
      continue
    }

    // create a 'fake' event point
    const fakePoint = {
      hasValue: function () {
        return true
      },
      tooltipPosition: function () {
        return this._model
      },
      _model: { x: e.x, y: yPosition },
      skip: false,
      stop: false,
      x: xValue,
      y: interpolatedValue,
    };

    items.push({ datasetIndex, element: fakePoint, index: 0 });
  }

  // add other, not interpolated, items
  const xItems = Interaction.modes.x(chart, e, options);

  for (let index = 0; index < xItems.length; index++) {
    const item = xItems[index];

    if (!chart.data.datasets[item.datasetIndex].interpolate) {
      items.push(item);
    }
  }

  return items
}

/*eslint no-var: "off"*/

var defaultOptions = {
  line: {
    color: "#F66",
    width: 1,
    dashPattern: [],
  },
  sync: {
    enabled: false,
    group: 1,
    suppressTooltips: false,
  },
  zoom: {
    enabled: false,
    zoomboxBackgroundColor: "rgba(66,133,244,0.2)",
    zoomboxBorderColor: "#48F",
    zoomButtonText: "Reset Zoom",
    zoomButtonClass: "reset-zoom",
  },
  snap: {
    enabled: false,
  },
  callbacks: {
    beforeZoom: function (start, end) {
      return true
    },
    afterZoom: function (start, end) {},
  },
};

var CrosshairPlugin = {
  id: "crosshair",

  afterInit: function (chart) {
    if (!chart.config.options.scales.x) {
      return
    }

    var xScaleType = chart.config.options.scales.x.type;

    if (xScaleType !== "linear" && xScaleType !== "time" && xScaleType !== "category" && xScaleType !== "logarithmic") {
      return
    }

    if (chart.options.plugins.crosshair === undefined) {
      chart.options.plugins.crosshair = defaultOptions;
    }

    chart.crosshair = {
      enabled: false,
      suppressUpdate: false,
      x: null,
      y: null,
      originalData: [],
      originalXRange: {},
      dragStarted: false,
      dragStartX: null,
      dragEndX: null,
      suppressTooltips: false,
      ignoreNextEvents: 0,
      reset: function () {
        this.resetZoom(chart, false, false);
      }.bind(this),
    };

    var syncEnabled = this.getOption(chart, "sync", "enabled");
    if (syncEnabled) {
      chart.crosshair.syncEventHandler = function (e) {
        this.handleSyncEvent(chart, e);
      }.bind(this);

      chart.crosshair.resetZoomEventHandler = function (e) {
        var syncGroup = this.getOption(chart, "sync", "group");

        if (e.chartId !== chart.id && e.syncGroup === syncGroup) {
          this.resetZoom(chart, true);
        }
      }.bind(this);

      window.addEventListener("sync-event", chart.crosshair.syncEventHandler);
      window.addEventListener("reset-zoom-event", chart.crosshair.resetZoomEventHandler);
    }

    chart.panZoom = this.panZoom.bind(this, chart);
  },

  afterDestroy: function (chart) {
    var syncEnabled = this.getOption(chart, "sync", "enabled");
    if (syncEnabled) {
      window.removeEventListener("sync-event", chart.crosshair.syncEventHandler);
      window.removeEventListener("reset-zoom-event", chart.crosshair.resetZoomEventHandler);
    }
  },

  panZoom: function (chart, increment) {
    if (chart.crosshair.originalData.length === 0) {
      return
    }
    var diff = chart.crosshair.end - chart.crosshair.start;
    var min = chart.crosshair.min;
    var max = chart.crosshair.max;
    if (increment < 0) {
      // left
      chart.crosshair.start = Math.max(chart.crosshair.start + increment, min);
      chart.crosshair.end = chart.crosshair.start === min ? min + diff : chart.crosshair.end + increment;
    } else {
      // right
      chart.crosshair.end = Math.min(chart.crosshair.end + increment, chart.crosshair.max);
      chart.crosshair.start = chart.crosshair.end === max ? max - diff : chart.crosshair.start + increment;
    }

    this.doZoom(chart, chart.crosshair.start, chart.crosshair.end);
  },

  getOption: function (chart, category, name) {
    return valueOrDefault(
      chart.options.plugins.crosshair[category] ? chart.options.plugins.crosshair[category][name] : undefined,
      defaultOptions[category][name]
    )
  },

  getXScale: function (chart) {
    return chart.data.datasets.length ? chart.scales[chart.getDatasetMeta(0).xAxisID] : null
  },
  getYScale: function (chart) {
    return chart.scales[chart.getDatasetMeta(0).yAxisID]
  },

  handleSyncEvent: function (chart, e) {
    var syncGroup = this.getOption(chart, "sync", "group");

    // stop if the sync event was fired from this chart
    if (e.chartId === chart.id) {
      return
    }

    // stop if the sync event was fired from a different group
    if (e.syncGroup !== syncGroup) {
      return
    }

    var xScale = this.getXScale(chart);

    if (!xScale) {
      return
    }

    var yScale = this.getYScale(chart);

    if (!yScale) {
      return
    }

    // Safari fix
    var buttons = e.original.native.buttons === undefined ? e.original.native.which : e.original.native.buttons;
    if (e.original.type === "mouseup") {
      buttons = 0;
    }
    
    // do not transmit click events to prevent unwanted changing of synced
    // charts. We do need to transmit an event to stop zooming on synced
    // charts however.
    var eventType = e.original.type == "click" ? "mousemove" : e.original.type;
    var newEvent = {
      type: eventType,
      chart: chart,
      x: xScale.getPixelForValue(e.xValue),
      y: yScale.getPixelForValue(e.yValue), //e.original.y,
      native: {
        buttons: buttons,
        // ChartJS filters events to plugins by the event's native type
        type: eventType
        // Possible fix
        // type: e.original.type == "click" ? "mousemove" : e.original.type
      },
      stop: true,
    };
    chart._eventHandler(newEvent);
  },

  afterEvent: function (chart, event) {
    if (chart.config.options.scales.x == undefined || chart.config.options.scales.x.length == 0) {
      return
    }

    const e = event.event;

    var xScaleType = chart.config.options.scales.x.type;

    if (xScaleType !== "linear" && xScaleType !== "time" && xScaleType !== "category" && xScaleType !== "logarithmic") {
      return
    }

    var xScale = this.getXScale(chart);

    if (!xScale) {
      return
    }

    var yScale = this.getYScale(chart);

    if (!yScale) {
      return
    }

    if (chart.crosshair.ignoreNextEvents > 0) {
      chart.crosshair.ignoreNextEvents -= 1;
      return
    }

    // fix for Safari
    var buttons = e.native.buttons === undefined ? e.native.which : e.native.buttons;
    if (e.native.type === "mouseup") {
      buttons = 0;
    }

    var syncEnabled = this.getOption(chart, "sync", "enabled");
    var syncGroup = this.getOption(chart, "sync", "group");

    // fire event for all other linked charts
    if (!e.stop && syncEnabled) {
      var event = new CustomEvent("sync-event"); // eslint-disable-line
      event.chartId = chart.id;
      event.syncGroup = syncGroup;
      event.original = e;
      event.xValue = xScale.getValueForPixel(e.x);
      event.yValue = yScale.getValueForPixel(e.y);
      window.dispatchEvent(event);
    }

    // suppress tooltips for linked charts
    var suppressTooltips = this.getOption(chart, "sync", "suppressTooltips");

    chart.crosshair.suppressTooltips = e.stop && suppressTooltips;

    chart.crosshair.enabled =
      e.type !== "mouseout" && e.x > xScale.getPixelForValue(xScale.min) && e.x < xScale.getPixelForValue(xScale.max);

    if (!chart.crosshair.enabled && !chart.crosshair.suppressUpdate) {
      if (e.x > xScale.getPixelForValue(xScale.max)) {
        // suppress future updates to prevent endless redrawing of chart
        chart.crosshair.suppressUpdate = true;
        chart.update("none");
      }
      chart.crosshair.dragStarted = false; // cancel zoom in progress
      return false
    }
    chart.crosshair.suppressUpdate = false;

    // handle drag to zoom
    var zoomEnabled = this.getOption(chart, "zoom", "enabled");

    if (buttons === 1 && !chart.crosshair.dragStarted && zoomEnabled) {
      chart.crosshair.dragStartX = e.x;
      chart.crosshair.dragStarted = true;
    }

    // handle drag to zoom
    if (chart.crosshair.dragStarted && buttons === 0) {
      chart.crosshair.dragStarted = false;

      var start = xScale.getValueForPixel(chart.crosshair.dragStartX);
      var end = xScale.getValueForPixel(chart.crosshair.x);

      if (Math.abs(chart.crosshair.dragStartX - chart.crosshair.x) > 1) {
        this.doZoom(chart, start, end);
      }
      chart.update("none");
    }

    chart.crosshair.x = e.x;
    chart.crosshair.y = e.y;

    chart.draw();
  },

  afterDraw: function (chart) {
    if (chart.crosshair == undefined || !chart.crosshair.enabled) {
      return
    }

    if (chart.crosshair.dragStarted) {
      this.drawZoombox(chart);
    } else {
      this.drawTraceLine(chart);
      this.interpolateValues(chart);
      this.drawTracePoints(chart);
    }

    return true
  },

  beforeTooltipDraw: function (chart) {
    // suppress tooltips on dragging
    return chart.crosshair == undefined || !chart.crosshair.dragStarted && !chart.crosshair.suppressTooltips
  },

  resetZoom: function (chart) {
    var stop = arguments.length > 1 && arguments[1] !== undefined ? arguments[1] : false;
    var update = arguments.length > 2 && arguments[2] !== undefined ? arguments[2] : true;

    if (update) {
      if (chart.crosshair.originalData.length > 0) {
        // reset original data
        for (var datasetIndex = 0; datasetIndex < chart.data.datasets.length; datasetIndex++) {
          var dataset = chart.data.datasets[datasetIndex];
          dataset.data = chart.crosshair.originalData.shift(0);
        }
      }

      // reset original xRange
      if (chart.crosshair.originalXRange.min) {
        chart.options.scales.x.min = chart.crosshair.originalXRange.min;
        chart.crosshair.originalXRange.min = null;
      } else {
        delete chart.options.scales.x.min;
      }
      if (chart.crosshair.originalXRange.max) {
        chart.options.scales.x.max = chart.crosshair.originalXRange.max;
        chart.crosshair.originalXRange.max = null;
      } else {
        delete chart.options.scales.x.max;
      }
    }

    if (chart.crosshair.button && chart.crosshair.button.parentNode) {
      chart.crosshair.button.parentNode.removeChild(chart.crosshair.button);
      chart.crosshair.button = false;
    }

    var syncEnabled = this.getOption(chart, "sync", "enabled");

    if (!stop && update && syncEnabled) {
      var syncGroup = this.getOption(chart, "sync", "group");

      var event = new CustomEvent("reset-zoom-event");
      event.chartId = chart.id;
      event.syncGroup = syncGroup;
      window.dispatchEvent(event);
    }
    if (update) {
      chart.update("none");
    }
  },

  doZoom: function (chart, start, end) {
    // swap start/end if user dragged from right to left
    if (start > end) {
      var tmp = start;
      start = end;
      end = tmp;
    }

    // notify delegate
    var beforeZoomCallback = valueOrDefault(
      chart.options.plugins.crosshair.callbacks ? chart.options.plugins.crosshair.callbacks.beforeZoom : undefined,
      defaultOptions.callbacks.beforeZoom
    );

    if (!beforeZoomCallback(start, end)) {
      return false
    }

    chart.crosshair.dragStarted = false;

    if (chart.options.scales.x.min && chart.crosshair.originalData.length === 0) {
      chart.crosshair.originalXRange.min = chart.options.scales.x.min;
    }
    if (chart.options.scales.x.max && chart.crosshair.originalData.length === 0) {
      chart.crosshair.originalXRange.max = chart.options.scales.x.max;
    }

    if (!chart.crosshair.button) {
      // add restore zoom button
      var button = document.createElement("button");

      var buttonText = this.getOption(chart, "zoom", "zoomButtonText");
      var buttonClass = this.getOption(chart, "zoom", "zoomButtonClass");

      var buttonLabel = document.createTextNode(buttonText);
      button.appendChild(buttonLabel);
      button.className = buttonClass;
      button.addEventListener(
        "click",
        function () {
          this.resetZoom(chart);
        }.bind(this)
      );
      chart.canvas.parentNode.appendChild(button);
      chart.crosshair.button = button;
    }

    // set axis scale
    chart.options.scales.x.min = start;
    chart.options.scales.x.max = end;

    // make a copy of the original data for later restoration

    var storeOriginals = chart.crosshair.originalData.length === 0 ? true : false;

    var filterDataset = chart.config.options.scales.x.type !== "category";

    if (filterDataset) {
      for (var datasetIndex = 0; datasetIndex < chart.data.datasets.length; datasetIndex++) {
        var newData = [];

        var index = 0;
        var started = false;
        var stop = false;
        if (storeOriginals) {
          chart.crosshair.originalData[datasetIndex] = chart.data.datasets[datasetIndex].data;
        }

        var sourceDataset = chart.crosshair.originalData[datasetIndex];

        for (var oldDataIndex = 0; oldDataIndex < sourceDataset.length; oldDataIndex++) {
          var oldData = sourceDataset[oldDataIndex];
          // var oldDataX = this.getXScale(chart).getRightValue(oldData)
          var oldDataX = oldData.x !== undefined ? oldData.x : NaN;

          // append one value outside of bounds
          if (oldDataX >= start && !started && index > 0) {
            newData.push(sourceDataset[index - 1]);
            started = true;
          }
          if (oldDataX >= start && oldDataX <= end) {
            newData.push(oldData);
          }
          if (oldDataX > end && !stop && index < sourceDataset.length) {
            newData.push(oldData);
            stop = true;
          }
          index += 1;
        }

        chart.data.datasets[datasetIndex].data = newData;
      }
    }

    chart.crosshair.start = start;
    chart.crosshair.end = end;

    if (storeOriginals) {
      var xAxes = this.getXScale(chart);
      chart.crosshair.min = xAxes.min;
      chart.crosshair.max = xAxes.max;
    }

    chart.crosshair.ignoreNextEvents = 2; // ignore next 2 events to prevent starting a new zoom action after updating the chart

    chart.update("none");

    var afterZoomCallback = this.getOption(chart, "callbacks", "afterZoom");

    afterZoomCallback(start, end);
  },

  drawZoombox: function (chart) {
    var yScale = this.getYScale(chart);

    var borderColor = this.getOption(chart, "zoom", "zoomboxBorderColor");
    var fillColor = this.getOption(chart, "zoom", "zoomboxBackgroundColor");

    chart.ctx.beginPath();
    chart.ctx.rect(
      chart.crosshair.dragStartX,
      yScale.getPixelForValue(yScale.max),
      chart.crosshair.x - chart.crosshair.dragStartX,
      yScale.getPixelForValue(yScale.min) - yScale.getPixelForValue(yScale.max)
    );
    chart.ctx.lineWidth = 1;
    chart.ctx.strokeStyle = borderColor;
    chart.ctx.fillStyle = fillColor;
    chart.ctx.fill();
    chart.ctx.fillStyle = "";
    chart.ctx.stroke();
    chart.ctx.closePath();
  },

  drawTraceLine: function (chart) {
    var xScale = this.getXScale(chart);    
    var yScale = this.getYScale(chart);

    var lineWidth = this.getOption(chart, "line", "width");
    var color = this.getOption(chart, "line", "color");
    var dashPattern = this.getOption(chart, "line", "dashPattern");
    var snapEnabled = this.getOption(chart, "snap", "enabled");

    var lineX = chart.crosshair.x;
    var lineY = chart.crosshair.y;

    if (snapEnabled && chart._active.length) {
      lineX = chart._active[0].element.x;
      lineY = chart._active[0].element.y;
    }

    chart.ctx.beginPath();
    chart.ctx.setLineDash(dashPattern);
    chart.ctx.moveTo(lineX, yScale.getPixelForValue(yScale.max));
    chart.ctx.lineWidth = lineWidth;
    chart.ctx.strokeStyle = color;
    chart.ctx.lineTo(lineX, yScale.getPixelForValue(yScale.min));
    chart.ctx.stroke();

    chart.ctx.beginPath();
    chart.ctx.setLineDash(dashPattern);
    chart.ctx.moveTo(xScale.getPixelForValue(xScale.min), lineY);  // Assuming xScale.min exists
    chart.ctx.lineWidth = lineWidth;
    chart.ctx.strokeStyle = color;
    chart.ctx.lineTo(xScale.getPixelForValue(xScale.max), lineY);  // Assuming xScale.max exists
    chart.ctx.stroke();
    
    chart.ctx.setLineDash([]);
  },

  drawTracePoints: function (chart) {
    for (var chartIndex = 0; chartIndex < chart.data.datasets.length; chartIndex++) {
      var dataset = chart.data.datasets[chartIndex];
      var meta = chart.getDatasetMeta(chartIndex);

      var yScale = chart.scales[meta.yAxisID];

      if (meta.hidden || !dataset.interpolate) {
        continue
      }

      chart.ctx.beginPath();
      chart.ctx.arc(chart.crosshair.x, yScale.getPixelForValue(dataset.interpolatedValue), 3, 0, 2 * Math.PI, false);
      chart.ctx.fillStyle = "white";
      chart.ctx.lineWidth = 2;
      chart.ctx.strokeStyle = dataset.borderColor;
      chart.ctx.fill();
      chart.ctx.stroke();
    }
  },

  interpolateValues: function (chart) {
    const ticks = chart?.scales?.x?.ticks;
    const isNumberTicks = Array.isArray(ticks) && ticks.every(it => typeof it.label === "number");

    for (let chartIndex = 0; chartIndex < chart.data.datasets.length; chartIndex++) {
      const dataset = chart.data.datasets[chartIndex];

      const meta = chart.getDatasetMeta(chartIndex);

      const xScale = chart.scales[meta.xAxisID];
      const yScale = chart.scales[meta.yAxisID];
      const xPixel = chart.crosshair.x;

      if (meta.hidden || !dataset.interpolate) {
        continue
      }

      const data = dataset.data;

      const isCategory = xScale.type === "category";
      const isStepped = dataset.stepped;

      if (isCategory) {
        const res = getInterpolatedValues({
          xScale,
          yScale,
          xPixelCursor: xPixel,
          data,
          ticks,
          isNumberTicks,
          isStepped,
        });

        dataset.interpolatedValue = res.yValueInterpolated;
        continue
      }

      const xValue = xScale.getValueForPixel(xPixel);
      const index = data.findIndex(o => o.x >= xValue);

      const prev = data[index - 1];
      const next = data[index];

      if (isStepped && prev) {
        dataset.interpolatedValue = prev.y;
      } else if (prev && next) {
        const slope = (next.y - prev.y) / (next.x - prev.x);
        dataset.interpolatedValue = prev.y + (xValue - prev.x) * slope;
      } else {
        dataset.interpolatedValue = NaN;
      }
    }
  },
};

export { CrosshairPlugin, interpolate as Interpolate, CrosshairPlugin as default };
