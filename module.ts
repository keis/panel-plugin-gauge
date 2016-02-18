import angular from 'angular';
import * as _ from 'lodash';
import * as $ from 'jquery';
import 'jquery.flot';
import 'jquery.flot.gauge';

import * as kbn from 'app/core/utils/kbn';
import TimeSeries from 'app/core/time_series2';
import {MetricsPanelCtrl} from 'app/plugins/sdk';

// Set and populate defaults
var panelDefaults = {
  links: [],
  datasource: null,
  maxDataPoints: 100,
  interval: null,
  targets: [{}],
  cacheTimeout: null,
  format: 'none',
  valueName: 'avg',
  thresholds: '',
  colorValue: false,
  colors: ["rgba(245, 54, 54, 0.9)", "rgba(237, 129, 40, 0.89)", "rgba(50, 172, 45, 0.97)"],
  minValue: 0,
  maxValue: 100,
  thresholdLabels: true
};

class GaugeCtrl extends MetricsPanelCtrl {
  static templateUrl = 'module.html';

  series: any[];
  data: any[];
  unitFormats: any[];

  /** @ngInject */
  constructor($scope, $injector, private $location, private linkSrv, private templateSrv) {
    super($scope, $injector);
    _.defaults(this.panel, panelDefaults);
  }

  initEditMode() {
    super.initEditMode();
    this.icon =  "fa fa-dashboard";
    this.addEditorTab('Options', 'public/plugins/gauge/editor.html', 2);
    this.unitFormats = kbn.getUnitFormats();
  }

  setUnitFormat(subItem) {
    this.panel.format = subItem.value;
    this.render();
  }

  refreshData(datasource) {
    return this.issueQueries(datasource)
      .then(this.dataHandler.bind(this))
      .catch(err => {
        this.series = [];
        this.render();
        throw err;
      });
  }

  loadSnapshot(snapshotData) {
    // give element time to get attached and get dimensions
    this.$timeout(() => this.dataHandler(snapshotData), 50);
  }

  dataHandler(results) {
    this.series = _.map(results.data, this.seriesHandler.bind(this));
    this.render();
  }

  seriesHandler(seriesData) {
    var series = new TimeSeries({
      datapoints: seriesData.datapoints,
      alias: seriesData.target,
    });

    series.flotpairs = series.getFlotPairs(this.panel.nullPointMode);
    return series;
  }

  invertColorOrder() {
    var tmp = this.panel.colors[0];
    this.panel.colors[0] = this.panel.colors[2];
    this.panel.colors[2] = tmp;
    this.render();
  }

  getDecimalsForValue(value) {
    if (_.isNumber(this.panel.decimals)) {
      return {decimals: this.panel.decimals, scaledDecimals: null};
    }

    var delta = value / 2;
    var dec = -Math.floor(Math.log(delta) / Math.LN10);

    var magn = Math.pow(10, -dec),
      norm = delta / magn, // norm is between 1.0 and 10.0
      size;

    if (norm < 1.5) {
      size = 1;
    } else if (norm < 3) {
      size = 2;
      // special case for 2.5, requires an extra decimal
      if (norm > 2.25) {
        size = 2.5;
        ++dec;
      }
    } else if (norm < 7.5) {
      size = 5;
    } else {
      size = 10;
    }

    size *= magn;

    // reduce starting decimals if not needed
    if (Math.floor(value) === value) { dec = 0; }

    var result: any = {};
    result.decimals = Math.max(0, dec);
    result.scaledDecimals = result.decimals - Math.floor(Math.log(size) / Math.LN10) + 2;

    return result;
  }

  render() {
    var data: any = {};
    this.setValues(data);

    data.thresholds = this.panel.thresholds.split(',').map(function(strVale) {
      return Number(strVale.trim());
    });

    data.colorMap = this.panel.colors;

    this.data = data;
    this.broadcastRender();
  }

  getValueFromSeries(series) {
    var lastPoint = _.last(series.datapoints);
    var lastValue = _.isArray(lastPoint) ? lastPoint[0] : null;

    if (_.isString(lastValue)) {
      return {
        value: 0,
        valueFormated: lastValue,
        valueRounded: 0
      };
    }

    var value = series.stats[this.panel.valueName];
    var decimalInfo = this.getDecimalsForValue(value);
    var formatFunc = kbn.valueFormats[this.panel.format];

    return {
      value: value,
      flotpairs: series.flotpairs,
      valueFormated: formatFunc(value, decimalInfo.decimals, decimalInfo.scaledDecimals),
      valueRounded: kbn.roundValue(value, decimalInfo.decimals)
    };
  }

  setValues(data) {
    data.flotpairs = [];

    if (this.series && this.series.length > 0) {
      _.extend(data, this.getValueFromSeries(this.series[0]));
      if (this.series.length >= 2) {
        data.maxValue = this.getValueFromSeries(this.series[1]).value;
      }
    }

    if (data.value === null || data.value === void 0) {
      data.valueFormated = "no value";
    }
  };

  link(scope, elem, attrs, ctrl) {
    var $location = this.$location;
    var linkSrv = this.linkSrv;
    var $timeout = this.$timeout;
    var panel = ctrl.panel;
    var templateSrv = this.templateSrv;
    var data, linkInfo;
    var elemHeight;
    var $panelContainer = elem.find('.panel-container');
    // change elem to gauge panel
    elem = elem.find('.gauge-panel');
    hookupDrilldownLinkTooltip();

    scope.$on('render', function() {
      render();
      ctrl.renderingCompleted();
    });

    function setElementHeight() {
      try {
        elemHeight = ctrl.height || panel.height || ctrl.row.height;
        if (_.isString(elemHeight)) {
          elemHeight = parseInt(elemHeight.replace('px', ''), 10);
        }

        elemHeight -= 5; // padding
        elemHeight -= panel.title ? 24 : 9; // subtract panel title bar

        elem.css('height', elemHeight + 'px');

        return true;
      } catch (e) { // IE throws errors sometimes
        return false;
      }
    }

    function addGauge() {
      var plotCanvas = $('<div></div>');
      var plotCss = {
        top: '10px',
        margin: 'auto',
        position: 'relative',
        height: elem.height() + 'px',
        width: elem.width() + 'px'
      };

      plotCanvas.css(plotCss);

      var thresholds = [];
      for (var i = 0; i < data.thresholds.length; i++) {
        thresholds.push({
          value: data.thresholds[i],
          color: data.colorMap[i]
        });
      }
      thresholds.push({
        value: panel.maxValue,
        color: data.colorMap[data.colorMap.length  - 1]
      });

      var options = {
        series: {
          gauges: {
            gauge: {
              min: panel.minValue,
              max: panel.maxValue,
              background: { color: 'rgb(38,38,38)'},
              border: { color: null },
              shadow: { show: false },
              width: 38
            },
            frame: { show: false },
            label: { show: false },
            layout: { margin: 0 },
            cell: { border: { width: 0 } },
            threshold: {
              values: thresholds,
              label: {
                show: panel.thresholdLabels,
                margin: 8,
                font: { size: 18 }
              },
              width: 8
            },
            value: {
              color: panel.colorValue ? getColorForValue(data, data.value) : null,
              formatter: function () { return data.valueFormated; },
              font: { size: 30 }
            },
            show: true
          }
        }
      };

      elem.append(plotCanvas);

      var plotSeries = {
        data: [[0, data.valueRounded]]
      };

      $.plot(plotCanvas, [plotSeries], options);
    }

    function render() {
      if (!ctrl.data) { return; }

      data = ctrl.data;
      setElementHeight();

      elem.html('');
      addGauge();

      elem.toggleClass('pointer', panel.links.length > 0);

      if (panel.links.length > 0) {
        linkInfo = linkSrv.getPanelLinkAnchorInfo(panel.links[0], panel.scopedVars);
      } else {
        linkInfo = null;
      }
    }

    function hookupDrilldownLinkTooltip() {
      // drilldown link tooltip
      var drilldownTooltip = $('<div id="tooltip" class="">hello</div>"');

      elem.mouseleave(function() {
        if (panel.links.length === 0) { return;}
        drilldownTooltip.detach();
      });

      elem.click(function(evt) {
        if (!linkInfo) { return; }
        // ignore title clicks in title
        if ($(evt).parents('.panel-header').length > 0) { return; }

        if (linkInfo.target === '_blank') {
          var redirectWindow = window.open(linkInfo.href, '_blank');
          redirectWindow.location;
          return;
        }

        if (linkInfo.href.indexOf('http') === 0) {
          window.location.href = linkInfo.href;
        } else {
          $timeout(function() {
            $location.url(linkInfo.href);
          });
        }

        drilldownTooltip.detach();
      });

      elem.mousemove(function(e) {
        if (!linkInfo) { return;}

        drilldownTooltip.text('click to go to: ' + linkInfo.title);
        drilldownTooltip.place_tt(e.pageX+20, e.pageY-15);
      });
    }
  }
}

function getColorForValue(data, value) {
  for (var i = data.thresholds.length; i > 0; i--) {
    if (value >= data.thresholds[i-1]) {
      return data.colorMap[i];
    }
  }
  return _.first(data.colorMap);
}

export {
  GaugeCtrl,
  GaugeCtrl as PanelCtrl,
  getColorForValue
};
