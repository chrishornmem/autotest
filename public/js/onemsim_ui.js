'use strict';

console.log('ONEmSimUIModule -------------------------------------------');

var ONEmSimUIModule = angular.module('ONEmSimUIModule', [
    'ui.bootstrap',
    'mp.autoFocus',
    'monospaced.elastic'
]);

ONEmSimUIModule.directive('focusMe', function($timeout) {
    return {
        scope: { trigger: '@focusMe' },
        link: function(scope, element) {
            scope.$watch('trigger', function(value) {
                if(value === "true") { 
                    $timeout(function() {
                        element[0].focus(); 
                    });
                }
            });
        }
    };
});

ONEmSimUIModule.directive('scrollBottom', function() {
    return {
        scope: {
            scrollBottom: "="
        },
        link: function(scope, element) {
            scope.$watchCollection('scrollBottom', function(newValue) {
                if (newValue) {
                    //$(element).scrollTop($(element)[0].scrollHeight);
                    var scrollHeight = $(element)[0].scrollHeight;
                    $(element).animate({ scrollTop: scrollHeight }, 300);
                };
            });
        }
    };
});

ONEmSimUIModule.directive('myClock', function($interval, dateFilter) {
    return {
        restrict: "A",
        transclude: true,
        scope: {
            format: "@"
        },
        link: function(scope, element, attrs) {
            var format = scope.clock || 'HH:mm:ss';

            var updateTime = function() {
                element.text(dateFilter(new Date(),format));
            };

            //Schedule update every second:
            var timer = $interval(updateTime, 1000);

            //Listen on DOM destroy (removal) event and cancel the next UI update
            //to prevent updating time after the DOM element was removed:
            element.on('$destroy', function() {
                $interval.cancel(timer);
            });
        }
    };
});

//ONEmSimUIModule.directive('ngEnter', function () {
//    return function (scope, element, attrs) {
//        element.bind("keydown keypress", function (event) {
//            if(event.which === 13) {
//                scope.$apply(function (){
//                    scope.$eval(attrs.ngEnter);
//                });
//
//                event.preventDefault();
//            }
//        });
//    };
//});

$(document).ready(function() {

    console.log('ready');

});

