/*eslint no-var: "off"*/
import { Interaction } from "chart.js"

export const getThrottledLog = ms => {
  let pass = true

  return (...args) => {
    if (!pass) return

    pass = false

    setTimeout(() => {
      pass = true
      console.log(...args)
    }, ms)
  }
}

const getXValFromIdx = (idx, ticks, isNumberTicks) => {
  // we pass `isNumberTicks` from outside the `for` cycle, so that we don't have to calculate it on every `getXValFromIdx` call
  if (!isNumberTicks) return idx

  const label = ticks[idx]?.label

  return typeof label === "number" ? label : idx
}

export const getInterpolatedValues = ({ xScale, yScale, xPixelCursor, data, ticks, isNumberTicks, isStepped }) => {
  let index = xScale.getValueForPixel(xPixelCursor)

  if (index <= xScale.min) index = 1

  const xPixelCurIndex = xScale.getPixelForValue(index)

  if (xPixelCursor > xPixelCurIndex) index = index + 1 // this condition is necessary because of how `xScale.getPixelForValue` is calculated

  if (index > xScale.max) index = xScale.max

  const x1 = getXValFromIdx(index - 1, ticks, isNumberTicks)
  const x2 = getXValFromIdx(index, ticks, isNumberTicks)

  const y1 = data[index - 1]
  const y2 = data[index]

  const prev = { x: x1, y: y1 }
  const next = { x: x2, y: y2 }

  const xPixel1 = xScale.getPixelForValue(index - 1)
  const xPixel2 = xScale.getPixelForValue(index)

  const relativeOffsetFromPoint1 = (xPixelCursor - xPixel1) / (xPixel2 - xPixel1)

  let xVal = (x2 - x1) * relativeOffsetFromPoint1 + x1
  let yVal = (y2 - y1) * relativeOffsetFromPoint1 + y1

  if (isStepped) yVal = xPixelCursor >= xScale.getPixelForValue(xScale.max) ? y2 : y1

  const firstXVal = index - 1 === xScale.min ? x1 : getXValFromIdx(xScale.min, ticks, isNumberTicks)
  const lastXVal = index === xScale.max ? x2 : getXValFromIdx(xScale.max, ticks, isNumberTicks)

  const firstYVal = yScale.min
  const lastYVal = yScale.max

  // because of interpolation inaccuracy `xVal` and `yVal` can get out of bounds of real values, here we fix this
  xVal = Math.max(firstXVal, Math.min(lastXVal, xVal))
  yVal = Math.max(firstYVal, Math.min(lastYVal, yVal))

  return { prev, next, xValueInterpolated: xVal, yValueInterpolated: yVal }
}

export default function (chart, e, options) {
  var items = []
  const ticks = chart?.scales?.x?.ticks
  const isNumberTicks = Array.isArray(ticks) && ticks.every(it => typeof it.label === "number")

  for (var datasetIndex = 0; datasetIndex < chart.data.datasets.length; datasetIndex++) {
    const dataset = chart.data.datasets[datasetIndex]

    // check for interpolate setting
    if (!dataset.interpolate) {
      continue
    }

    const meta = chart.getDatasetMeta(datasetIndex)

    // do not interpolate hidden charts
    if (meta.hidden) {
      continue
    }

    const xScale = chart.scales[meta.xAxisID]
    const yScale = chart.scales[meta.yAxisID]

    let xValue = xScale.getValueForPixel(e.x)

    if (xValue > xScale.max || xValue < xScale.min) {
      continue
    }

    const data = dataset.data

    const isCategory = xScale.type === "category"
    const isStepped = dataset.stepped

    let interpolatedValue, prev, next
    let index = -1

    if (isCategory) {
      const res = getInterpolatedValues({
        xScale,
        yScale,
        xPixelCursor: e.x,
        data,
        ticks,
        isNumberTicks,
        isStepped,
      })

      prev = res.prev
      next = res.next

      xValue = res.xValueInterpolated
      interpolatedValue = res.yValueInterpolated
    } else {
      index = data.findIndex(o => o.x >= xValue)

      if (index === -1) {
        continue
      }

      // linear interpolate value
      prev = data[index - 1]
      next = data[index]
    }

    if (prev && next && !isCategory) {
      const slope = (next.y - prev.y) / (next.x - prev.x)
      interpolatedValue = prev.y + (xValue - prev.x) * slope
    }

    if (isStepped && prev && !isCategory) {
      interpolatedValue = prev.y
    }

    if (isNaN(interpolatedValue)) {
      continue
    }

    const yPosition = yScale.getPixelForValue(interpolatedValue)

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
    }

    items.push({ datasetIndex, element: fakePoint, index: 0 })
  }

  // add other, not interpolated, items
  const xItems = Interaction.modes.x(chart, e, options)

  for (let index = 0; index < xItems.length; index++) {
    const item = xItems[index]

    if (!chart.data.datasets[item.datasetIndex].interpolate) {
      items.push(item)
    }
  }

  return items
}
