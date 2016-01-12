define([
  'angular',
  'app/app',
  'lodash',
  'jquery',
  'jquery.flot',
  './vendor/jquery.flot.gauge',
],
function (angular, app, _, $) {
  'use strict';

  var module = angular.module('grafana.panels.gauge', []);
  app.useModule(module);

  module.directive('gaugePanel', function($location, linkSrv, $timeout, templateSrv) {

    return {
      link: function(scope, elem) {
        var data, panel, linkInfo;
        var $panelContainer = elem.parents('.panel-container');

        scope.$on('render', function() {
          render();
          scope.panelRenderingComplete();
        });

        function setElementHeight() {
          try {
            var height = scope.height || panel.height || scope.row.height;
            if (_.isString(height)) {
              height = parseInt(height.replace('px', ''), 10);
            }

            height -= 5; // padding
            height -= panel.title ? 24 : 9; // subtract panel title bar

            elem.css('height', height + 'px');

            return true;
          } catch(e) { // IE throws errors sometimes
            return false;
          }
        }

        function getColorForValue(value) {
          for (var i = data.thresholds.length - 1; i >= 0 ; i--) {
            if (value >= data.thresholds[i]) {
              return data.colorMap[i];
            }
          }
          return null;
        }

        function addGauge() {
          var size = Math.min(elem.width(), elem.height());

          var plotCanvas = $('<div></div>');
          var plotCss = {
            top: '10px',
            margin: 'auto',
            position: 'relative',
            height: (size - 20) + 'px',
            width: size + 'px'
          };

          plotCanvas.css(plotCss);

          var thresholds = [];
          for (var i = 0; i <= data.thresholds.length; i++) {
            thresholds.push({
              value: (i === data.thresholds.length) ? panel.gauge.maxValue : data.thresholds[i+1],
              color: data.colorMap[i]
            });
          }

          var options = {
            series: {
              gauges: {
                debug: { log: true },
                gauge: {
                  min: panel.gauge.minValue,
                  max: panel.gauge.maxValue,
                  frameColor: 'rgb(38,38,38)',
                  stroke: { color: null },
                  shadow: { show: false },
                },
                layout: { margin: 0 },
                cell: { border: { width: 0 } },
                threshold: {
                  values: thresholds,
                  width: 8
                },
                value: {
                  color: panel.colorValue ? getColorForValue(data.value) : null,
                  formatter: function () { return data.valueFormated; }
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
          if (!scope.data) { return; }

          data = scope.data;
          panel = scope.panel;

          setElementHeight();

          elem.html('')
          addGauge();

          elem.toggleClass('pointer', panel.links.length > 0);

          if (panel.links.length > 0) {
            linkInfo = linkSrv.getPanelLinkAnchorInfo(panel.links[0], scope.panel.scopedVars);
          } else {
            linkInfo = null;
          }
        }

        // drilldown link tooltip
        var drilldownTooltip = $('<div id="tooltip" class="">hello</div>"');

        elem.mouseleave(function() {
          if (panel.links.length === 0) { return;}
          drilldownTooltip.detach();
        });

        elem.click(function() {
          if (!linkInfo) { return; }

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
    };
  });

});
