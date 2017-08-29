'use strict';

var ONEmSimModule = angular.module('ONEmSimModule', [
    'ngRoute',
    'ngResource',
    'matchMedia',
    'btford.socket-io',
    'ONEmSimUIModule'
]);

ONEmSimModule.config(['$routeProvider', '$locationProvider',
    function($routeProvider, $locationProvider) {

        $routeProvider.
        when('/', {
            templateUrl: 'views/partials/onemSim.html',
            controller:  'mainController'
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
    'dateFilter',
    function($scope, $http, SmsHandler, DataModel, Socket, dateFilter) {

        var isInCall = 0;

        console.log("mainController initialising");

        //These are the variables needed for the code found at https://chromium.googlesource.com/chromium/src.git/+/lkgr/chrome/test/data/webrtc/adapter.js?autodive=0%2F
        var RTCPeerConnection = null;
        var getUserMedia = null;
        var attachMediaStream = null;
        var reattachMediaStream = null;
        var webrtcDetectedBrowser = null;
        var webrtcDetectedVersion = null;

        //function trace(text) {
        //    // This function is used for logging.
        //    if (text[text.length - 1] == '\n') {
        //        text = text.substring(0, text.length - 1);
        //    };
        //    console.log((performance.now() / 1000).toFixed(3) + ": " + text);
        //};

        if (navigator.mozGetUserMedia) {
            console.log("This appears to be Firefox");
            webrtcDetectedBrowser = "firefox";
            webrtcDetectedVersion = parseInt(navigator.userAgent.match(/Firefox\/([0-9]+)\./)[1]);
            // The RTCPeerConnection object.
            RTCPeerConnection = mozRTCPeerConnection;
            // The RTCSessionDescription object.
            RTCSessionDescription = mozRTCSessionDescription;
            // Get UserMedia (only difference is the prefix).
            // Code from Adam Barth.
            getUserMedia = navigator.mozGetUserMedia.bind(navigator);
            // Attach a media stream to an element.
            attachMediaStream = function(element, stream) {
                console.log("Attaching media stream");
                element.mozSrcObject = stream;
                element.play();
            };
            reattachMediaStream = function(to, from) {
                console.log("Reattaching media stream");
                to.mozSrcObject = from.mozSrcObject;
                to.play();
            };
        } else if (navigator.webkitGetUserMedia) {
            console.log("This appears to be Chrome");
            webrtcDetectedBrowser = "chrome";
            webrtcDetectedVersion = parseInt(navigator.userAgent.match(/Chrom(e|ium)\/([0-9]+)\./)[2]);
            // The RTCPeerConnection object.
            RTCPeerConnection = webkitRTCPeerConnection;
            // Get UserMedia (only difference is the prefix).
            // Code from Adam Barth.
            getUserMedia = navigator.webkitGetUserMedia.bind(navigator);
            // Attach a media stream to an element.
            attachMediaStream = function(element, stream) {
                console.log("Attaching media stream");
                if (typeof element.srcObject !== 'undefined') {
                    element.srcObject = stream;
                } else if (typeof element.mozSrcObject !== 'undefined') {
                    element.mozSrcObject = stream;
                } else if (typeof element.src !== 'undefined') {
                    element.src = URL.createObjectURL(stream);
                } else {
                    console.log('Error attaching stream to element.');
                };
            };
            reattachMediaStream = function(to, from) {
                console.log("Reattaching media stream");
                to.src = from.src;
            };
            // The representation of tracks in a stream is changed in M26.
            // Unify them for earlier Chrome versions in the coexisting period.
            if (!webkitMediaStream.prototype.getVideoTracks) {
                webkitMediaStream.prototype.getVideoTracks = function() {
                    return this.videoTracks;
                };
                webkitMediaStream.prototype.getAudioTracks = function() {
                    return this.audioTracks;
                };
            };
            // New syntax of getXXXStreams method in M26.
            if (!webkitRTCPeerConnection.prototype.getLocalStreams) {
                webkitRTCPeerConnection.prototype.getLocalStreams = function() {
                    return this.localStreams;
                };
                webkitRTCPeerConnection.prototype.getRemoteStreams = function() {
                    return this.remoteStreams;
                };
            }
        } else {
            console.log("Browser does not appear to be WebRTC-capable");
        };

        //These are the buttons of the phone's user interface:
        var AnswerButton = $('.call_tools a.answer');
        var RejectButton = $('.call_tools a.cancel');
        var CallButton = $('.screen a.call');
        var ClosePanelButton = $('.screen a.closer');
        var TalkTimer = $('.answer .talktime');

        //var audioElement = document.getElementById('myAudio');
        var audioElement = $('#myAudio')[0];
        audioElement.autoplay = true;
        console.log(audioElement);
        //var videoElement = document.getElementById('myVideo');
        var videoElement = $('#myVideo')[0];
        videoElement.autoplay = true;
        console.log(videoElement);

        var nowMoment = new Date(Date.parse('1970-01-01T00:00:00.000'));
        function updateTalkTime() {
            TalkTimer.text('Current call: ' + dateFilter(nowMoment,'HH:mm:ss'));
            nowMoment.setSeconds(nowMoment.getSeconds() + 1);
        };
        var talkTime = null;

        var globalSession = null;

        // Register callbacks to desired call events
        var eventHandlers = {
            'progress'  : function(e) {
                console.log('eventHandlers - progress');
            },
            'failed'    : function(e) {
                console.log('eventHandlers - failed');
                audioElement.pause();
                videoElement.pause();
                videoElement.hidden = true;
                $('.phone div.answer .user').removeClass('.off');
                isInCall = 0;
                clearInterval(talkTime);
                nowMoment = new Date(Date.parse('1970-01-01T00:00:00.000'));
                TalkTimer.text('Current call: ' + dateFilter(nowMoment,'HH:mm:ss'));
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
                videoElement.pause();
                videoElement.hidden = true;
                $('.phone div.answer .user').removeClass('.off');
                isInCall = 0;
                clearInterval(talkTime);
                nowMoment = new Date(Date.parse('1970-01-01T00:00:00.000'));
                TalkTimer.text('Current call: ' + dateFilter(nowMoment,'HH:mm:ss'));
                $('.phone div.panel').removeClass('open');
                $('.phone .call_notif').removeClass('on');
                $('.answer ul.nums').removeClass('on');
                $('.answer #typed_no').val('');
                $('.dialer #typed_no').val('');
                $('.caller #typed_no').val('');
            },
            'confirmed' : function(e) {
                console.log('eventHandlers - confirmed');
                audioElement.pause();

                //Schedule update of talk time every second:
                talkTime = setInterval(updateTalkTime, 1000);

                //RTCPeerConnection.getLocalStreams/getRemoteStreams are deprecated. Use RTCPeerConnection.getSenders/getReceivers instead.
                //audioElement.src = window.URL.createObjectURL(globalSession.connection.getRemoteStreams()[0]);
                //audioElement.srcObject = globalSession.connection.getRemoteStreams()[0];
                videoElement.src = window.URL.createObjectURL(globalSession.connection.getRemoteStreams()[0]);
                if(globalSession.connection.getRemoteStreams()[0].getVideoTracks().length) {
                    videoElement.hidden = false;
                    $('.phone div.answer .user').addClass('.off');
                    //.phone .answer .user.off
                    console.log("with video");
                } else {
                    videoElement.hidden = true;
                    $('.phone div.answer .user').removeClass('.off');
                    console.log("no video");
                };
                if(webrtcDetectedBrowser == "firefox") {
                    //audioElement.play();
                    videoElement.play();
                };
                //audioElement.play();
                //attachMediaStream(audioElement,globalSession.connection.getRemoteStreams()[0]);
                isInCall = 1;
            },
            'addstream' : function(e) {
                console.log('eventHandlers - addstream');
            }
        };

        var mediaConstraints = {
            audio: true,
            video: true
        };

        var mediaStream = null;

        var options = {
            eventHandlers          : eventHandlers,
            sessionTimersExpires   : 600,
            session_timers         : true,
            useUpdate              : false,
            use_preloaded_route    : false,
            pcConfig               : {
                rtcpMuxPolicy      : 'negotiate',
                iceServers         : // [ {
                //        urls       : 'stun:stun.l.google.com:19302'
                //    }, {
                //        urls       : 'turn:192.158.29.39:3478?transport=udp',
                //        credential : 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
                //        username   : '28224511:1379330808'
                //    }, {
                //        urls       : 'turn:192.158.29.39:3478?transport=tcp',
                //        credential : 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
                //        username   : '28224511:1379330808'
                //    }
                //]
                [
                    { urls         : [ 'stun:stun.l.google.com:19302' ] }
                    //{ urls         : [ 'stun:stunserver.org' ] }
                ]
            },
            media                  : {
                constraints        : mediaConstraints,
                stream             : mediaStream,
                render             : {
                    remote         : videoElement
                }
            }
        };

        var startResponse = SmsHandler.start({}, function() {
            $scope.msisdn = startResponse.msisdn;
            var sipProxy = startResponse.sipproxy;
            var wsProtocol = startResponse.wsprotocol;
            console.log("msisdn: " + $scope.msisdn);
            console.log("SIP Proxy: " + sipProxy);
            console.log("web socket protocol: " + wsProtocol);

            //SIP.js configuration:
            var configuration = {
                uri               : $scope.msisdn + '@' + sipProxy,
                wsServers         : [ wsProtocol + '://' + sipProxy ],
                authorizationUser : $scope.msisdn,
                noAnswerTimeout   : 120,
                password          : 'ONEmP@$$w0rd2016',
                register          : true,
                registerExpires   : 120,
                stunServers       : [ 'stun:stun.l.google.com:19302' ],
                usePreloadedRoute : false
            };

            var phoneONEm = new SIP.UA(configuration);

            var target = null;

            function useSession(s) {
                globalSession = s;
                globalSession.on('bye', function () {
                    globalSession = null;
                });
            };

            function hangUp() {
                if (globalSession && globalSession.startTime && !globalSession.endTime) {
                    globalSession.bye();
                }
            };

            function getUserMediaSuccess (stream) {
                console.log('getUserMedia succeeded', stream)
                mediaStream = stream;

                // Makes a call
                useSession(phoneONEm.invite(target, {
                    media: {
                        stream: mediaStream,
                        render: {
                            remote: {
                                video: videoElement
                            }
                        }

                    }
                }));

                // Picks up incoming calls
                phoneONEm.on('invite', function(globalSession) {
                    console.log('invite');

                    useSession(globalSession);

                    $('.phone div.caller').addClass('open');

                    //Play ring tone:
                    if(globalSession.direction === "incoming") {
                        //Incoming call; play ring
                        console.log("Playing incoming call ring:");
                        audioElement.src = "/sounds/old_british_phone.wav";
                    } else {
                        //Outgoing call; play ringback tone
                        console.log("Playing outgoing callback tone:");
                        audioElement.src = "/sounds/ringing_tone_uk_new.wav";
                    };

                    //audioElement.play();
                    if(webrtcDetectedBrowser == "firefox") {
                        audioElement.play();
                    };

                    //originator
                    console.log('Caller ID: ' + globalSession.remoteIdentity.uri.user);
                    console.log('User Name: ' + globalSession.remoteIdentity.display_name);
                    $('.answer #typed_no').val(globalSession.remoteIdentity.uri.user);
                    $('.caller #typed_no').val(globalSession.remoteIdentity.uri.user);
                    $scope.usr_name = globalSession.remoteIdentity.display_name;

                    globalSession.on("failed",function(e){
                        console.log('invite - incoming - failed');
                        audioElement.pause();
                        videoElement.pause();
                        videoElement.hidden = true;
                        $('.phone div.answer .user').removeClass('.off');
                        isInCall = 0;
                        clearInterval(talkTime);
                        nowMoment = new Date(Date.parse('1970-01-01T00:00:00.000'));
                        TalkTimer.text('Current call: ' + dateFilter(nowMoment,'HH:mm:ss'));
                        $('.phone div.panel').removeClass('open');
                        $('.phone .call_notif').removeClass('on');
                        $('.answer ul.nums').removeClass('on');
                        $('.answer #typed_no').val('');
                        $('.dialer #typed_no').val('');
                        $('.caller #typed_no').val('');
                        ////if(phoneONEm.isConnected()) phoneONEm.terminateSessions();
                        //if(phoneONEm.isConnected()) globalSession.terminate();
                    });
                    globalSession.on("ended",function(e){
                        console.log('invite - incoming - ended');
                        audioElement.pause();
                        videoElement.pause();
                        videoElement.hidden = true;
                        $('.phone div.answer .user').removeClass('.off');
                        isInCall = 0;
                        clearInterval(talkTime);
                        nowMoment = new Date(Date.parse('1970-01-01T00:00:00.000'));
                        TalkTimer.text('Current call: ' + dateFilter(nowMoment,'HH:mm:ss'));
                        $('.phone div.panel').removeClass('open');
                        $('.phone .call_notif').removeClass('on');
                        $('.answer ul.nums').removeClass('on');
                        $('.answer #typed_no').val('');
                        $('.dialer #typed_no').val('');
                        $('.caller #typed_no').val('');
                        ////if(phoneONEm.isConnected()) phoneONEm.terminateSessions();
                        //if(phoneONEm.isConnected()) globalSession.terminate();
                    });
                    globalSession.on("accepted",function(e){
                        console.log('invite - incoming - accepted');
                        audioElement.pause();

                        //Schedule update of talk time every second:
                        talkTime = setInterval(updateTalkTime, 1000);

                        //RTCPeerConnection.getLocalStreams/getRemoteStreams are deprecated. Use RTCPeerConnection.getSenders/getReceivers instead.
                        //audioElement.src = window.URL.createObjectURL(globalSession.connection.getRemoteStreams()[0]);
                        //audioElement.srcObject = globalSession.connection.getRemoteStreams()[0];
                        videoElement.src = window.URL.createObjectURL(globalSession.connection.getRemoteStreams()[0]);
                        if(globalSession.connection.getRemoteStreams()[0].getVideoTracks().length) {
                            videoElement.hidden = false;
                            $('.phone div.answer .user').addClass('.off');
                            //.phone .answer .user.off
                            console.log("with video");
                        } else {
                            videoElement.hidden = true;
                            $('.phone div.answer .user').removeClass('.off');
                            console.log("no video");
                        };
                        if(webrtcDetectedBrowser == "firefox") {
                            //audioElement.play();
                            videoElement.play();
                        };
                        //audioElement.play();
                        //attachMediaStream(audioElement,globalSession.connection.getRemoteStreams()[0]);
                        isInCall = 1;
                    });
                    globalSession.on("addstream",function(e) {
                        console.log('invite - incoming - addstream');
                    });
                    //// End call in 30 seconds:
                    //setTimeout(IncomingEndCall, 30000);

                    //globalSession.accept({
                    //    media: mediaStream
                    //});
                });
            };

            function getUserMediaFailure (e) {
                console.error('getUserMedia failed:', e);
            };

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
                console.log("[UI]: Sending DTMF " + val);
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

            $.each($('.panel textarea[data-autoresize]'), function() {
                var offset = this.offsetHeight - this.clientHeight;
                var resizeTextarea = function(el) {
                    $(el).css('height', 'auto').css('height', el.scrollHeight + offset);
                };
                $(this).on('keyup input', function(e) { 
                    resizeTextarea(this); 
                }).removeAttr('data-autoresize');
            });

            $('.panel textarea').keypress(function(e) {
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

            phoneONEm.on('invite', function(globalSession){
                console.log('invite');

                $('.phone div.caller').addClass('open');

                //Play ring tone:
                if(globalSession.direction === "incoming") {
                    //Incoming call; play ring
                    console.log("Playing incoming call ring:");
                    audioElement.src = "/sounds/old_british_phone.wav";
                } else {
                    //Outgoing call; play ringback tone
                    console.log("Playing outgoing callback tone:");
                    audioElement.src = "/sounds/ringing_tone_uk_new.wav";
                };

                //audioElement.play();
                if(webrtcDetectedBrowser == "firefox") {
                    audioElement.play();
                };

                //originator
                console.log('Caller ID: ' + globalSession.remoteIdentity.uri.user);
                console.log('User Name: ' + globalSession.remoteIdentity.display_name);
                $('.answer #typed_no').val(globalSession.remoteIdentity.uri.user);
                $('.caller #typed_no').val(globalSession.remoteIdentity.uri.user);
                $scope.usr_name = globalSession.remoteIdentity.display_name;

                globalSession.on("failed",function(e){
                    console.log('invite - incoming - failed');
                    audioElement.pause();
                    videoElement.pause();
                    videoElement.hidden = true;
                    $('.phone div.answer .user').removeClass('.off');
                    isInCall = 0;
                    clearInterval(talkTime);
                    nowMoment = new Date(Date.parse('1970-01-01T00:00:00.000'));
                    TalkTimer.text('Current call: ' + dateFilter(nowMoment,'HH:mm:ss'));
                    $('.phone div.panel').removeClass('open');
                    $('.phone .call_notif').removeClass('on');
                    $('.answer ul.nums').removeClass('on');
                    $('.answer #typed_no').val('');
                    $('.dialer #typed_no').val('');
                    $('.caller #typed_no').val('');
                    ////if(phoneONEm.isConnected()) phoneONEm.terminateSessions();
                    //if(phoneONEm.isConnected()) globalSession.terminate();
                });
                globalSession.on("ended",function(e){
                    console.log('invite - incoming - ended');
                    audioElement.pause();
                    videoElement.pause();
                    videoElement.hidden = true;
                    $('.phone div.answer .user').removeClass('.off');
                    isInCall = 0;
                    clearInterval(talkTime);
                    nowMoment = new Date(Date.parse('1970-01-01T00:00:00.000'));
                    TalkTimer.text('Current call: ' + dateFilter(nowMoment,'HH:mm:ss'));
                    $('.phone div.panel').removeClass('open');
                    $('.phone .call_notif').removeClass('on');
                    $('.answer ul.nums').removeClass('on');
                    $('.answer #typed_no').val('');
                    $('.dialer #typed_no').val('');
                    $('.caller #typed_no').val('');
                    ////if(phoneONEm.isConnected()) phoneONEm.terminateSessions();
                    //if(phoneONEm.isConnected()) globalSession.terminate();
                });
                globalSession.on("accepted",function(e){
                    console.log('invite - incoming - accepted');
                    audioElement.pause();

                    //Schedule update of talk time every second:
                    talkTime = setInterval(updateTalkTime, 1000);

                    //RTCPeerConnection.getLocalStreams/getRemoteStreams are deprecated. Use RTCPeerConnection.getSenders/getReceivers instead.
                    //audioElement.src = window.URL.createObjectURL(globalSession.connection.getRemoteStreams()[0]);
                    //audioElement.srcObject = globalSession.connection.getRemoteStreams()[0];
                    videoElement.src = window.URL.createObjectURL(globalSession.connection.getRemoteStreams()[0]);
                    if(globalSession.connection.getRemoteStreams()[0].getVideoTracks().length) {
                        videoElement.hidden = false;
                        $('.phone div.answer .user').addClass('.off');
                        //.phone .answer .user.off
                        console.log("with video");
                    } else {
                        videoElement.hidden = true;
                        $('.phone div.answer .user').removeClass('.off');
                        console.log("no video");
                    };
                    if(webrtcDetectedBrowser == "firefox") {
                        //audioElement.play();
                        videoElement.play();
                    };
                    //audioElement.play();
                    //attachMediaStream(audioElement,globalSession.connection.getRemoteStreams()[0]);
                    isInCall = 1;
                });
                globalSession.on("addstream",function(e) {
                    console.log('invite - incoming - addstream');
                });

                // Answer the call:
                AnswerButton.click( function(){
                    console.log('AnswerButton - click');
                    console.log(globalSession);
                    console.log(phoneONEm);
                    globalSession.accept(options);
                    $('.phone div.panel').removeClass('open');
                    $('.phone div.answer').addClass('open');
                    isInCall = 1;
                });

                //// End call in 30 seconds:
                //setTimeout(IncomingEndCall, 30000);
            });

            phoneONEm.on('connecting', function(data){
                console.log('connecting');
            });

            phoneONEm.on('connected', function(data){
                console.log('connected');
            });

            phoneONEm.on('disconnected', function(data){
                console.log('disconnected');
            });

            phoneONEm.on('registered', function(data){
                console.log('registered');
            });

            phoneONEm.on('unregistered', function(data){
                console.log('unregistered');
            });

            phoneONEm.on('registrationFailed', function(data){
                console.log('registrationFailed');
            });

            phoneONEm.on('referred', function(data){
                console.log('referred');
            });

            phoneONEm.on('cancel', function(data){
                console.log('cancel');
            });

            // For debug run this in the browser's console and reload the page:
            // JsSIP.debug.enable('JsSIP:*');


            // End the call or reject the call:
            RejectButton.click( function(){
                console.log('RejectButton - click');
                //phoneONEm.terminateSessions();
                globalSession.terminate();
            });

            //Make a phone call:
            CallButton.click( function(){
                console.log('CallButton - click; Call to ' + $('.dialer #typed_no').val());
                target = 'sip:' + $('.dialer #typed_no').val() + '@' + sipProxy;
                globalSession = phoneONEm.invite(target, options);
                //if (mediaStream) {
                //    getUserMediaSuccess(mediaStream);
                //} else {
                //    if (SIP.WebRTC.isSupported()) {
                //        SIP.WebRTC.getUserMedia(mediaConstraints, getUserMediaSuccess, getUserMediaFailure);
                //    }
                //};
                isInCall = 1;
                $('.answer #typed_no').val( $('.dialer #typed_no').val() );
                $('.dialer #typed_no').val('');
                $('.phone div.panel').removeClass('open');
                $('.screen div.answer').addClass('open');
            });

            ClosePanelButton.click(function(e){
                console.log('ClosePanelButton - click');
                $('.phone div.panel').removeClass('open');
                hangUp();
                if(isInCall==1) $('.phone div.answer').toggleClass('open');
            });

            //function IncomingEndCall() {
            //  //phoneONEm.bye();
            //  globalSession.bye();
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

