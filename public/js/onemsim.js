'use strict';

var ONEmSimModule = angular.module('ONEmSimModule', [
    'ui.bootstrap',
    'ngRoute',
    'ngResource',
    'matchMedia',
    'btford.socket-io'
]);

ONEmSimModule.config(['$routeProvider', '$locationProvider',
    function($routeProvider, $locationProvider) {

        $routeProvider.
        when('/', {
            templateUrl: 'views/partials/onemSim.html',
            controller: 'mainController'
        }).
        otherwise({
            redirectTo: '/'
        });

        $locationProvider.html5Mode(true);

        String.prototype.startsWith = function(needle) {
            return (this.indexOf(needle) === 0);
        };
    }
]);

ONEmSimModule.config(['$httpProvider',
    function($httpProvider) {
        $httpProvider.interceptors.push([
            '$rootScope',
            '$q',
            '$window',
            '$location',
            function($rootScope, $q, $window, $location) {
                return {
                    request: function(config) {
                        if ($window.localStorage.token) {

                        }
                        return config;
                    },
                    responseError: function(response) {
                        switch (response.status) {
                            case 400:
                            case 401:
                            case 403:
                            case 404:
                                $location.path('/');
                                break;
                            default:
                                break;
                        }
                        return $q.reject(response);
                    }
                };
            }
        ]);
    }
]);

ONEmSimModule.factory('Socket', function(socketFactory) {
    var mySocket = socketFactory();
    mySocket.forward('error');
    mySocket.forward('MT SMS');
    return mySocket;
});

ONEmSimModule.factory('SmsHandler', [
    '$resource',
    function($resource) {
        return $resource('/api', {}, {
            getResponse: {
                method: 'GET',
                url: 'api/getResponse',
                params: {
                    moText: '@moText'
                },
                isArray: false
            },
            start: {
                method: 'GET',
                url: 'api/start',
                isArray: false
            }
        });
    }
]);

ONEmSimModule.directive('scrollBottom', function() {
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

ONEmSimModule.directive('myClock', function($interval, dateFilter) {
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

ONEmSimModule.factory('DataModel', function() {
    var data = {
        tabs: [
            { name: "Files", isActive: true, refId: "#file-manager-tab" },
            { name: "Log", isActive: false, refId: "#log-tab" },
            { name: "Develop", isActive: false, refId: "#develop-tab" },
            { name: "Help", isActive: false, refId: "#help-tab" }
        ],
        results: [],
        logs: [],
        comments: []
    };

    return {
        data: data,
        clearComments: function() {
            data.comments = [];
            return data.comments;
        },
        getTabs: function() {
            return data.tabs;
        },
        getResults: function() {
            return data.results;
        },
        getComments: function() {
            return data.comments;
        },
        getLogs: function() {
            return data.logs;
        },
        selectTab: function(tab) {
            for (var i = 0; i < data.tabs.length; i++) {
                if (tab.refId === data.tabs[i].refId) {
                    data.tabs[i].isActive = true;
                } else {
                    data.tabs[i].isActive = false;
                }
            }
            return data.tabs;
        },
        addResult: function(result) {
            data.results.push(result);
            return data.results;
        },
        addComment: function(comment) {
            data.comments.push(comment);
            return data.comments;
        },
        addLog: function(log) {
            data.logs.push(log);
            return data.logs;
        },
        clearLogs: function() {
            data.logs = [];
            return data.logs;
        }
    };
});

ONEmSimModule.controller('mainController', [
    '$scope',
    '$http',
    'SmsHandler',
    'DataModel',
    'Socket',
    function($scope, $http, SmsHandler, DataModel, Socket) {

        var isInCall = 0;

        console.log("mainController initialising");

        //These are the buttons of the phone's user interface:
        var AnswerButton = $('.call_tools a.answer');
        var RejectButton = $('.call_tools a.cancel');
        var CallButton = $('.screen a.call');
        var ClosePanelButton = $('.screen a.closer');

        var audioElement = document.getElementById('myAudio');
        console.log(audioElement);

        var globalSession = null;

        // Register callbacks to desired call events
        var eventHandlers = {
            'progress'  : function(e) {
                console.log('eventHandlers - progress');
            },
            'failed'    : function(e) {
                console.log('eventHandlers - failed');
                audioElement.pause();
                isInCall = 0;
                $('.phone div.panel').removeClass('open');
                $('.phone .call_notif').removeClass('on');
                $('.answer ul.nums').removeClass('on');
                $('.answer #typed_no').val('');
                $('.dialer #typed_no').val('');
                $('.caller #typed_no').val('');
            },
            'ended'     : function(e) {
                console.log('eventHandlers - ended');
                audioElement.pause();
                isInCall = 0;
                $('.phone div.panel').removeClass('open');
                $('.phone .call_notif').removeClass('on');
                $('.answer ul.nums').removeClass('on');
                $('.answer #typed_no').val('');
                $('.dialer #typed_no').val('');
                $('.caller #typed_no').val('');
            },
            'confirmed' : function(e) {
                console.log('eventHandlers - confirmed');
                //RTCPeerConnection.getLocalStreams/getRemoteStreams are deprecated. Use RTCPeerConnection.getSenders/getReceivers instead.
                audioElement.src = window.URL.createObjectURL(globalSession.connection.getRemoteStreams()[0]);
                //audioElement.srcObject = globalSession.connection.getRemoteStreams()[0];
                audioElement.play();
                isInCall = 1;
            },
            'addstream' : function(e) {
                console.log('eventHandlers - addstream');
            }
        };

        var options = {
            'eventHandlers'          : eventHandlers,
            'sessionTimersExpires'   : 600,
            'session_timers'         : true,
            'use_preloaded_route'    : false,
            'pcConfig'               : {
                'rtcpMuxPolicy'      : 'negotiate',
                'iceServers'         : // [ {
                //        'urls'       : 'stun:stun.l.google.com:19302'
                //    }, {
                //        'urls'       : 'turn:192.158.29.39:3478?transport=udp',
                //        'credential' : 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
                //        'username'   : '28224511:1379330808'
                //    }, {
                //        'urls'       : 'turn:192.158.29.39:3478?transport=tcp',
                //        'credential' : 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
                //        'username'   : '28224511:1379330808'
                //    }
                //]
                [
                    { 'urls'         : [ 'stun:stun.l.google.com:19302' ] }
                    //{ 'urls'         : [ 'stun:stunserver.org' ] }
                ]
            },
            'mediaConstraints'       : { 'audio' : true, 'video' : false }
        };

        var startResponse = SmsHandler.start({}, function() {
            $scope.msisdn = startResponse.msisdn;
            var sipProxy = startResponse.sipproxy;
            var wsProtocol = startResponse.wsprotocol;
            console.log("msisdn: " + $scope.msisdn);
            console.log("SIP Proxy: " + sipProxy);
            console.log("web socket protocol: " + wsProtocol);

            var socket = new JsSIP.WebSocketInterface(wsProtocol + '://' + sipProxy);

            //JsSIP configuration:
            var configuration = {
                'sockets'  : [ socket ],
                'uri'      : 'sip:' + $scope.msisdn + '@' + sipProxy,
                'password' : 'ONEmP@$$w0rd2016'
            };

            var phoneONEm = new JsSIP.UA(configuration);

            $('a.full').click(function(e){
                e.preventDefault();
                $('.phone').toggleClass('full');
                $('body').toggleClass('full');
                $(this).toggleClass('toggled')
                return false;
            });

            $('a.open_dialer').click(function(e) {
                e.preventDefault();
                $(this).parents('.phone').find('div.dialer').toggleClass('open');
                console.log('[UI]: Dialer state changed!');
                return false;
            });

            $('.answer a.num').click(function(e){
                e.preventDefault();
                var $btn = $(this);
                var val = $(this).data('val');
                $btn.addClass('pressed');
                setTimeout(function () {
                    $btn.removeClass('pressed');
                }, 400);
                globalSession.sendDTMF(val);
                console.log("Sending DTMF " + val);
                return false;
            });

            $('.dialer a.num').click(function(e){
                e.preventDefault();
                var $btn = $(this);
                var val = $(this).data('val');
                var resizeTextarea = function(el) {
                    var offset = el[0].offsetHeight - el[0].clientHeight;
                    $(el).css('height', 'auto').css('height', el[0].scrollHeight + offset);
                };
                $btn.addClass('pressed');
                setTimeout(function () {
                    $btn.removeClass('pressed');
                }, 400);
                $('.dialer #typed_no').val($('.dialer #typed_no').val() + val);
                resizeTextarea($('.dialer #typed_no'));
                return false;
            });

            $('a.delete').click(function(e){
                e.preventDefault();
                var $btn = $(this);
                $btn.addClass('pressed');
                //setTimeout(function () {
                //    $btn.removeClass('pressed');
                //}, 400);
                $('.dialer #typed_no').val($('.dialer #typed_no').val().slice(0,-1));
                return false;
            });

            $.each($('textarea[data-autoresize]'), function() {
                var offset = this.offsetHeight - this.clientHeight;
                var resizeTextarea = function(el) {
                    $(el).css('height', 'auto').css('height', el.scrollHeight + offset);
                };
                $(this).on('keyup input', function(e) { 
                    resizeTextarea(this); 
                }).removeAttr('data-autoresize');
            });

            $('textarea').keypress(function(e) {
                var a = [];
                var k = e.which;
                a.push(8);
                a.push(42);
                a.push(43);
                for (var i = 48; i < 58; i++) a.push(i);
                if (!(a.indexOf(k)>=0)) e.preventDefault();
            });

            $('a.numpad').click(function(e) {
                e.preventDefault();
                $('.answer ul.nums').toggleClass('on');
                console.log('[UI]: In call numpad state changed');
                return false;
            });

            $('.answer a.minimize').click(function(e) {
                e.preventDefault();
                $('.call_notif').addClass('on');
                $('.phone div.panel').removeClass('open');
                console.log('[UI]: Pannels minimized from answer panel');
                return false;
            });

            $('.call_notif a.resume').click(function(e) {
                e.preventDefault();
                $('.call_notif').removeClass('on');
                $('.phone div.panel.answer').addClass('open');
                console.log('[UI]: Answer panel maximized');
                return false;
            });

            phoneONEm.start();

            phoneONEm.on('newRTCSession', function(data){
                console.log('newRTCSession');
                globalSession = data.session; //session pointer
                //console.log(globalSession);

                $('.phone div.caller').addClass('open');

                //Play ring tone:
                if(globalSession.direction === "incoming") {
                    //Incoming call; play ring
                    console.log("Load incoming call ring:");
                    audioElement.src = "/sounds/old_british_phone.wav";
                } else {
                    //Outgoing call; play ringback tone
                    console.log("Load outgoing callback tone:");
                    audioElement.src = "/sounds/ringing_tone_uk_new.wav";
                };

                console.log("Play the loaded sound:");
                audioElement.play();
             
                //originator
                console.log('Caller ID: ' + globalSession.remote_identity.uri.user);
                console.log('User Name: ' + globalSession.remote_identity.display_name);
                $('.answer #typed_no').val(globalSession.remote_identity.uri.user);
                $('.caller #typed_no').val(globalSession.remote_identity.uri.user);
                $scope.usr_name = globalSession.remote_identity.display_name;

                if(globalSession.direction === "incoming"){
                    //incoming call here:
                    globalSession.on("accepted",function(){
                        console.log('newRTCSession - incoming - accepted');
                        ////RTCPeerConnection.getLocalStreams/getRemoteStreams are deprecated. Use RTCPeerConnection.getSenders/getReceivers instead.
                        audioElement.src = window.URL.createObjectURL(globalSession.connection.getRemoteStreams()[0]);
                        //audioElement.srcObject = globalSession.connection.getRemoteStreams()[0];
                        audioElement.play();
                        isInCall = 1;
                    });
                    globalSession.on("ended",function(e){
                        console.log('newRTCSession - incoming - ended');
                        audioElement.pause();
                        isInCall = 0;
                        $('.phone div.panel').removeClass('open');
                        $('.phone .call_notif').removeClass('on');
                        $('.answer ul.nums').removeClass('on');
                        $('.answer #typed_no').val('');
                        $('.dialer #typed_no').val('');
                        $('.caller #typed_no').val('');
                    });
                    globalSession.on("failed",function(e){
                        console.log('newRTCSession - incoming - failed');
                        audioElement.pause();
                        isInCall = 0;
                        $('.phone div.panel').removeClass('open');
                        $('.phone .call_notif').removeClass('on');
                        $('.answer ul.nums').removeClass('on');
                        $('.answer #typed_no').val('');
                        $('.dialer #typed_no').val('');
                        $('.caller #typed_no').val('');
                    });

                    //// End call in 30 seconds:
                    //setTimeout(IncomingEndCall, 30000);
                };
            });

            // For debug run this in the browser's console and reload the page:
            // JsSIP.debug.enable('JsSIP:*');

            // Answer the call:
            AnswerButton.click( function(){
                console.log('AnswerButton - click');
                globalSession.answer(options);
                $('.phone div.panel').removeClass('open');
                $('.phone div.answer').addClass('open');
                isInCall = 1;
            });

            // End the call or reject the call:
            RejectButton.click( function(){
                console.log('RejectButton - click');
                globalSession.terminate();
            });

            //Make a phone call:
            CallButton.click( function(){
                console.log('CallButton - click; Call to ' + $('.dialer #typed_no').val());
                phoneONEm.call('sip:' + $('.dialer #typed_no').val() + '@' + sipProxy, options);
                isInCall = 1;
                $('.answer #typed_no').val( $('.dialer #typed_no').val() );
                $('.dialer #typed_no').val('');
                $('.phone div.panel').removeClass('open');
                $('.screen div.answer').addClass('open');
            });

            ClosePanelButton.click(function(e){
                console.log('ClosePanelButton - click');
                $('.phone div.panel').removeClass('open');
                if(globalSession) globalSession.terminate();
                if(isInCall==1) $('.phone div.answer').toggleClass('open');
            });

            //function IncomingEndCall() {
            //  globalSession.terminate();
            //};

        });

        $scope.comments = DataModel.getComments();
        $scope.results = DataModel.getResults();
        $scope.logs = DataModel.getLogs();
        $scope.responsesCount = 0;

        $scope.resetComments = function() {
            $scope.comments = DataModel.clearComments;
        };

        $scope.resetlogs = function() {
            $scope.logs = DataModel.clearLogs;
        };

        $scope.$on('error', function(ev, data) {
            console.log("socket error:" + ev);
            console.log(ev);
            console.log(data);
        });

        $scope.$on('socket:MT SMS', function(ev, data) {
            $scope.theData = data;

            console.log("MT received:");
            console.log(data);

            var outputObj = {
                type: "mt",
                value: data.mtText
            };

            $scope.results = DataModel.addResult(outputObj);

        });

        $scope.smsInput = function() {

            if (typeof $scope.smsText === 'undefined' || $scope.smsText.length === 0) return;

            var inputObj = {
                type: "mo",
                value: $scope.smsText
            };
            $scope.results = DataModel.addResult(inputObj);

            console.log("calling emit");

            Socket.emit('MO SMS', $scope.smsText);

            $scope.smsText = '';
        };
    }
]);

