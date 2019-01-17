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
/**
 * Created by tmaoz on 20/07/2017.
 */

(function(){

    // create array prefilled with 'size' the 'data' function
    function createArray(size, data) {
        var ret = [];
        for(var i=0; i<size; i++) {
            ret.push(data(i));
        }
        return ret;
    }

    // get query params
    var collectorUrl = $.url().param("collector");
    var id = $.url().param("id");
    var dmapp = $.url().param("dmapp");
    var manifest = $.url().param("manifest");
    console.log("Got collector URL [" + collectorUrl + "]");
    console.log("Got componenet ID [" + id + "]");

    // create player
    var url = manifest ? manifest : $("#url").val();
    var video_tag = $("#videoPlayer")[0];
    var player = SANDPlayer(video_tag, url,
        {
            id: id,
            dmapp: dmapp,
            collectorUrl: collectorUrl,
            collectorType: SANDPlayer_Collectors.COLLECT_AT_INTERVAL,
            collectionInterval: 1000
        });

    // put usage data in graph?
    var options = {
        legend:{
            backgroundOpacity: 0.5,
            noColumns: 0,
            backgroundColor: "green",
            position: "ne"
        }
    };
    player.onStatsUpdate(function(data) {

        var addLength = player.options.monitor_history - data.bandwidth.video.history.length;

        // video
        var video = createArray(addLength,
            function(item) {return [item - player.options.monitor_history + 1,0]});
        var both = createArray(addLength,
            function(item) {return [item - player.options.monitor_history + 1,0]});
        for (var item = 0; item < data.bandwidth.video.history.length; item ++) {
            video.push([item - data.bandwidth.video.history.length + 1,
                data.bandwidth.video.history[item] / 1024]);
            both.push([item - data.bandwidth.video.history.length + 1, video[item][1]]);
        }

        // audio
        var audio = createArray(addLength,
            function(item) {return [item-player.options.monitor_history,0]});
        for (var item = 0; item < data.bandwidth.audio.history.length; item ++) {
            audio.push([item - data.bandwidth.audio.history.length + 1,
                data.bandwidth.audio.history[item] / 1024]);
            both[item + addLength][1] += audio[item + addLength][1];
        }

        // average both
        var average = createArray(addLength,
            function(item) {return [item-player.options.monitor_history,0]});
        for (var item = 0; item < data.bandwidth.video.history.length; item ++) {
            average.push([item - data.bandwidth.audio.history.length + 1,
                data.bandwidth.average / 1024]);
        }

        $.plot("#bandwidth", [
            {label: "Video", data: video},
            {label: "Audio", data: audio},
            {label: "Both", data: both},
            {label: "Average", data: average}], options);
    });

    // start playback when ready
    player.init(function() {
        player.play();

        // stop after 5 seconds
        /*setTimeout(function() {
            player.pause();
            player.destroy();
            console.log("Destroyed player!");
        }, 5000);*/
    });
})();