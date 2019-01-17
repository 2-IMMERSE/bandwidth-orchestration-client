/** Copyright 2018 Cisco and/or its affiliates

 Licensed under the Apache License, Version 2.0 (the "License");
 you may not use this file except in compliance with the License.
 You may obtain a copy of the License at

 http://www.apache.org/licenses/LICENSE-2.0

 Unless required by applicable law or agreed to in writing, software
 distributed under the License is distributed on an "AS IS" BASIS,
 WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 See the License for the specific language governing permissions and
 limitations under the License.
 */
// SANDPlayer collection types enum
const SANDPlayer_Collectors = {
    NEVER_COLLECT: 0,
    COLLECT_AT_INTERVAL: 1,
    COLLECT_ON_SEGMENT_DONE: 2,
    COLLECT_ON_STATS_CHANGE: 3,
    COLLECT_ON_STATS_CHANGE_THROTTLED: 4,
    COLLECT_ON_SEGMENT_DONE_THROTTLED: 5
};

// create a SANDPlayer using the given video tag, DASH URL and options
var SANDPlayer = function (video_tag, video_url, userOption) {

    // defaults
    var options = {
        // ID for this player (component), generate new one if not given
        id: generateUUID(),

        // DMAppID, generate new if not given
        dmapp: generateUUID(),

        // monitor interval in ms
        monitor_interval: 1000,

        // history items to keep
        monitor_history: 30,

        // last interval monitored
        monitorLastInterval: 0,

        // URL of the collector (Bandwdith Orchestration Service)
        collectorUrl: null,

        // Collection type (choose from the enum above)
        collectorType: SANDPlayer_Collectors.NEVER_COLLECT,

        // data collection interval
        collectionInterval: 1000,
    };

    //<editor-fold desc="Utilities">
    // generate a UUID
    function generateUUID() {
        var d = new Date().getTime();
        var uuid = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
            var r = (d + Math.random()*16)%16 | 0;
            d = Math.floor(d/16);
            return (c=='x' ? r : (r&0x3|0x8)).toString(16);
        });
        return uuid;
    };
    //</editor-fold>

    //<editor-fold desc="Bandwidth Monitor">
    // collection interval object
    var reporter;

    // monitor background task
    var monitor;

    // stats update client callback
    var onStatsUpdateCallback;
    
    // an MPEG DASH SAND message template
    var sandMessage = {
        senderId: options.id,
        dmappId: options.dmapp
    };

    // metric holder
    var metric = {
        averageThroughput: {
            avgVideoThroughput: 0,
            avgAudioThroughput: 0,
            avgThroughput: 0
        },
        bandwidth: {
            video: {
                current: 0,
                history: [],
                average: 0
            },
            audio: {
                current: 0,
                history: [],
                average: 0
            },
            current: 0,
            average: 0
        },
        bitrate: {
            playing: {
                video: 0,
                audio: 0
            },
            queued: {
                video: 0,
                audio: 0
            }
        },
        bitrates: {
            video: [],
            audio: []
        },
        status: "uninitialized"
    };
    var prevMetric = $.extend(true, {}, metric);

    // bandwidth data
    var fragmentRequests = {};
    var fragmentState = {};

    var buildMessage = function() {
        return $.extend(true, {},
            sandMessage,
            metric,
            {generationTime: Date.now()});
    }

    // report metrics to collector
    var sendMetric = function() {

        // build message
        var message = buildMessage();

        // send sand message to collector
        //console.log("Sending metrics: " + message);
        $.ajax({
            method: "POST",
            url: options.collectorUrl,
            data: JSON.stringify(message),
            contentType: "application/json"
        }).done(function(data, status, q) {
            console.log("sent metrics");
        }).fail(function(data, status, q) {
            console.log("failed to send metrics: " + status);
        });

        setTimeout(function() {onStatsUpdateCallback(message)}, 0);
    };

    // get the current average throughput and send to the collector
    var collectMetrics = function() {
        metric.averageThroughput.avgVideoThroughput = player.getAverageThroughput("video");
        metric.averageThroughput.avgAudioThroughput = player.getAverageThroughput("audio");
        metric.averageThroughput.avgThroughput =
            metric.averageThroughput.avgVideoThroughput +
            metric.averageThroughput.avgAudioThroughput;

        // we make a copy here because this changes while we work!
        // TODO: make sure we actually need to copy ...
        var videoMetrics = $.extend(true, {}, player.getMetricsFor("video"));
        var audioMetrics = $.extend(true, {}, player.getMetricsFor("audio"));
        var dashMetrics = $.extend(true, {}, player.getDashMetrics());

        // current playing bitrate
        metric.bitrate.playing.video =
            metric.bitrates.video[player.getQualityFor('video')];
        metric.bitrate.playing.audio =
            metric.bitrates.audio[player.getQualityFor('audio')];

        // current scheduled bitrate
        var videoQuality = dashMetrics.getCurrentSchedulingInfo(videoMetrics).quality;
        metric.bitrate.queued.video = isNaN(videoQuality) ? prevMetric.bitrate.queued.video :
            metric.bitrates.video[videoQuality];
        var audioQuality = dashMetrics.getCurrentSchedulingInfo(audioMetrics).quality;
        metric.bitrate.queued.audio = isNaN(audioQuality) ? prevMetric.bitrate.queued.audio :
            metric.bitrates.audio[audioQuality];

        sendMetric();
    };

    // monitoring function
    var monitorPlayer = function() {
        // now?
        var intervalEnd = Date.now();
        var intervalStart = options.monitorLastInterval;
        options.monitorLastInterval = intervalStart;
        var intervalSize = intervalEnd - intervalStart;

        /** bandwidth **/
        // start by copying the data so it doesn't change anymore!
        var requests = $.extend(true, {}, fragmentRequests);

        var bandwidth = {
            video: 0,
            audio: 0
        };

        // go over the requests
        for (var url in requests) {
            var request = requests[url];

            if (!request.firstByteDate) {
                continue;
            }

            // the request is done
            if (request.requestEndDate) {

                // thee request started and ended within the current interval
                if (request.requestStartDate >= intervalStart) {
                    var duration = request.requestEndDate - request.requestStartDate;
                    // console.log("case 1");
                    // console.log(request.requestEndDate - 0);
                    // console.log(request.requestStartDate - 0);
                    // console.log(duration);
                    // console.log(request.bytesTotal);
                    bandwidth[request.mediaType] += 1000.0 / duration * request.bytesTotal;
                    delete fragmentRequests[url];
                }

                // the request started before this interval start and ended within this interval
                else if (request.requestStartDate < intervalStart) {

                    var duration = request.requestEndDate - intervalStart;
                    var reduction = fragmentState[url] ? fragmentState[url] : 0;
                    // console.log("case 2");
                    // console.log(duration);
                    // console.log(request.bytesTotal - reduction);
                    bandwidth[request.mediaType] += 1000.0 / duration * (request.bytesTotal - reduction);
                    delete fragmentState[url]
                    delete fragmentRequests[url];
                }
            } else {

                // the request started within this interval and has not yet finished
                if (request.requestStartDate >= intervalStart) {

                    var duration = intervalEnd - request.requestStartDate;
                    // console.log("case 3");
                    // console.log(duration);
                    // console.log(request.bytesLoaded);
                    bandwidth[request.mediaType] += 1000.0 / duration * request.bytesLoaded;
                    fragmentState[url] = request.bytesLoaded;
                }

                // this request started before this interval and has not yet ended
                else {

                    var duration = intervalSize;
                    var reduction = fragmentState[url] ? fragmentState[url] : 0;
                    // console.log("case 4");
                    // console.log(duration);
                    // console.log(request.bytesLoaded - reduction);
                    bandwidth[request.mediaType] += 1000.0 / duration * (request.bytesLoaded - reduction);
                    fragmentState[url] = request.bytesLoaded;
                }
            }
        }

        // hopefully, we should now have proper bandwidth measurements!
        metric.bandwidth.video.current = bandwidth.video;
        metric.bandwidth.audio.current = bandwidth.audio;
        metric.bandwidth.current = bandwidth.video + bandwidth.audio;

        metric.bandwidth.video.history.push(bandwidth.video);
        if (metric.bandwidth.video.history.length > options.monitor_history) {
            metric.bandwidth.video.history.shift();
        }
        metric.bandwidth.video.average =
            metric.bandwidth.video.history.reduce(function(sum, value) {return sum + value;}, 0) /
            metric.bandwidth.video.history.length;

        metric.bandwidth.audio.history.push(bandwidth.audio);
        if (metric.bandwidth.audio.history.length > options.monitor_history) {
            metric.bandwidth.audio.history.shift();
        }
        metric.bandwidth.audio.average =
            metric.bandwidth.audio.history.reduce(function(sum, value) {return sum + value;}, 0) /
            metric.bandwidth.audio.history.length;

        metric.bandwidth.average = metric.bandwidth.video.average + metric.bandwidth.audio.average;

        prevMetric = $.extend(true, {}, metric);
    };
    //</editor-fold>

    // prep options
    options = $.extend(true, options, userOption);
    sandMessage.senderId = options.id;
    sandMessage.dmappId = options.dmapp;

    // create the dash player
    var player = dashjs.MediaPlayer().create();

    // register a callback function to do client-side handling of stats updates
    var onStatsUpdate = function(callback) {
        onStatsUpdateCallback = callback;
    }

    // initialize the player
    var init = function(onCanPlay = function(){}) {
        
        // update network state
        player.on(dashjs.MediaPlayer.events.FRAGMENT_LOADING_STARTED, function(e) {
            metric.status = "downloading";
            fragmentRequests[e.request.url] = e.request;
        });
        player.on(dashjs.MediaPlayer.events.FRAGMENT_LOADING_COMPLETED, function() {
            metric.status = "idle";
        });
        player.on(dashjs.MediaPlayer.events.FRAGMENT_LOADING_ABANDONED, function() {
            metric.status = "idle";
        });

        // run user provided callback when ready to start playback
        player.on(dashjs.MediaPlayer.events.CAN_PLAY, function () {

            // get available bitrates
            player.getBitrateInfoListFor("video").forEach(function(item, index) {
                metric.bitrates.video[item.qualityIndex] = item.bitrate;
            });
            player.getBitrateInfoListFor("audio").forEach(function(item, index) {
                metric.bitrates.audio[item.qualityIndex] = item.bitrate;
            });

            onCanPlay();
        });

        // init
        player.initialize(video_tag, video_url, false);

        // start the monitor
        monitor = setInterval(monitorPlayer, options.monitor_interval);
        options.monitorLastInterval = Date.now();

        // setup callbacks
        switch (options.collectorType) {
            case SANDPlayer_Collectors.COLLECT_ON_SEGMENT_DONE_THROTTLED:
                player.on(dashjs.MediaPlayer.events.FRAGMENT_LOADING_COMPLETED,
                    $.throttle(options.collectionInterval, collectMetrics));
                break;

            case SANDPlayer_Collectors.COLLECT_ON_STATS_CHANGE_THROTTLED:
                player.on(dashjs.MediaPlayer.events.METRIC_CHANGED,
                    $.throttle(options.collectionInterval, collectMetrics));
                break;

            case SANDPlayer_Collectors.COLLECT_AT_INTERVAL:
                reporter = setInterval(collectMetrics, options.collectionInterval);
                break;

            case SANDPlayer_Collectors.COLLECT_ON_SEGMENT_DONE:
                player.on(dashjs.MediaPlayer.events.FRAGMENT_LOADING_COMPLETED, collectMetrics);
                break;

            case SANDPlayer_Collectors.COLLECT_ON_STATS_CHANGE:
                player.on(dashjs.MediaPlayer.events.METRIC_CHANGED, collectMetrics);
                break;

            case SANDPlayer_Collectors.NEVER_COLLECT:
                break;

            default:
                console.log("No such collection policy, will NOT send statistics to collector!");
                break;
        }
    }

    // start playback
    var play = function() {
        player.play();
    };

    // stop/pause playback
    var pause = function() {
        player.pause();
    };

    // destroy player
    var destroy = function() {
        player.pause();
        if (reporter) {
            clearInterval(reporter);
            reporter = undefined;
        }
        if (monitor) {
            clearInterval(monitor);
            monitor = undefined;
        }
        player.reset();
    };

    // toggle (true/false) Adaptive BitRate
    var toggleABR = function(vaule) {
        player.setAutoSwitchQuality(value);
    };

    // toggle (true/false) Adaptive BitRate for given type ("video" or "audio")
    var toggleABRForType = function(type, vaule) {
        player.setAutoSwitchQualityFor(type, value);
    };

    // toggle (true/false) video Adaptive BitRate
    var toggleVideoABR = function(toggle) {
        player.setAutoSwitchQualityFor("video", value);
    };

    // toggle (true/false) audio Adaptive BitRate
    var toggleAudioABR = function(toggle) {
        player.setAutoSwitchQualityFor("audio", value);
    };

    // get the quality index of the given bitrate.
    // if this bitrate does not exist, returns 0.
    var getQualityForBitrate = function(type, bitrate) {
        for (var quality in metric.bitrates[type]) {
            if (metric.bitrates[type][quality] == bitrate) {
                return quality;
            }
        }
        return 0;
    }

    // set the bitrate for the given type ("video" or "audio"). selects first bitrate if doesn't exist.
    var setBitrate = function(type, bitrate) {
        player.setQualityFor(type, getQualityForBitrate(type, bitrate));
    }

    // set the video bitrate. selects first bitrate if doesn't exist.
    var setVideoBitrate = function(bitrate) {
        player.setQualityFor("video", getQualityForBitrate("video", bitrate));
    };

    // set the audio bitrate. selects first bitrate if doesn't exist.
    var setAudioBitrate = function(bitrate) {
        player.setQualityFor("audio", getQualityForBitrate("audio", bitrate));
    };

    // limit the allowed bitrate for type ("video" or "audio"). use NaN to clear limit
    var limitBitrate = function(type, bitrate) {
        player.setMaxAllowedBitrateFor(type, bitrate);
    };

    // limit the alowed video bitrate. use NaN to clear limit
    var limitVideoBitrate = function(bitrate) {
        player.setMaxAllowedBitrateFor("video", bitrate);
    };

    // limit the allowed audio bitrate. use NaN to clear limit
    var limitAudioBitrate = function(bitrate) {
        player.setMaxAllowedBitrateFor("audio", bitrate);
    };

    // return the list of available video and audio bitrates. valid only after player initialization
    var getAvailableBitrates = function() {
        return $.extend(true, [], metric.bitrates);
    };

    return {
        /** DATA **/
        // the DOM node of the video tag
        video_tag: video_tag,

        // video url
        video_url: video_url,

        // the dash.js player
        player: player,

        // options
        options: options,

        /** Metrics **/
        // function run when sending stats (in case you want to do something with the stats client-side
        onStatsUpdate: onStatsUpdate,

        /** Playback Control **/
        // initialize the player, can get a callback to run when ready
        init: init,

        play: play,
        pause: pause,

        // pause playback, clear reporter and clear monitor, reset the dash.js player
        destroy: destroy,

        /** Bitrate Control (valid only after initialization) **/
        toggleABR: toggleABR,
        toggleABRForType: toggleABRForType,
        toggleVideoABR: toggleVideoABR,
        toggleAudioABR: toggleAudioABR,
        setBitrate: setBitrate,
        setVideoBitrate: setVideoBitrate,
        setAudioBitrate: setAudioBitrate,
        limitBitrate: limitBitrate,
        limitVideoBitrate: limitVideoBitrate,
        limitAudioBitrate: limitAudioBitrate,
        getAvailableBitrates: getAvailableBitrates
    };
};

