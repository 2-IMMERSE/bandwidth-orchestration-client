# 2-IMMERSE Bandwidth Orchestration Enabled Dash.JS Player

In order to be able to do bandwidth management between multiple clients,
there's a need for the clients to send bandwidth usage statistics to the cloud collector.

The [MPEG DASH SAND](http://dashif.org/wp-content/uploads/2017/01/SAND-Whitepaper-Dec13-final.pdf)
standard aims to enable **"Server and Network Assisted DASH"** by defining message formats and usage
cases for such management to help take better advantage of multi-client knowledge and network elements
to improve DASH performance. SAND defines all the metrics as optional and allows for custom metrics as
well.

As it is, the standard [dash.js](https://github.com/Dash-Industry-Forum/dash.js|dash.js) player
is not yet fully compliant with SAND and doesn't include SAND reporting capabilities. It does, however,
collect some metrics defined by the SAND standard.

Our new **SANDPlayer** object (in the *lib* folder) wraps the standard dash.js player and adds the
ability to monitor its bandwidth usage in several ways, and send the data to a given collector. As it
is designed to wrap 2-Immerse DMApp video player components, it passes its instance ID as the SAND
SenderID, and includes the DMApp ID as well. It sends a collection of metrics:

* Average Throughput (as measured by the dash.js player itself)
* Bandwidth (SANDPlayer calculates that by keeping track of the player's fragment requests)
  * Current video, audio and combined bandwidth usage
  * Average video, audio and combined bandwidth
  * Bandwidth history (customizable history period)
* Bitrate
  * Currently playing bitrate
  * Scheduled bitrate (as decided by the player's ABR logic)

### Limitations:

* There is no way to actually monitor a component's or a page's bandwidth usage within a browser
without using a special extension, the only thing we can do is try to track the segment download
requests that the dash.js allows us to see. We try to track the "bytes downloaded" value on a
timeline and sum up the value for all the concurrent downloads for each time usint. This method is
not accurate at best!

* Since there is no way to tell whether XHR requests (used by dash.js to download fragments)
are being fetched from the actual remote server or from the browser's cache, the bandwidth monitoring
data might not be the actual network usage of the player...


## Example

The included sample client shows a simple use case of the player. It uses SANDPlayer to play a given
DASH manifest, and displays the calculated bandwidth usage data in a graph below the video.

The **player.html** file loads the requires JavaScript libs, including the SANDPlayer lib, it defines a
**\<video\>** tag for the player to use and a **\<div id="banwidth"\>** tag to render the bandwidth
usage graph in. It then loads the **player.js** script that contains the client code.

The client starts by retrieving some optional query parameters from the client's URL:
* collector - The collector service's url (http://127.0.0.1:3000/collect)
* id - The component's instance ID (by default, a random UUID is generated locally)
* dmapp - The DMApp ID (by default, a random UUID is generated locally)
* manifest - A URL to the dash manifest that should be played (by default, we use http://www.bok.net/dash/tears_of_steel/cleartext/stream.mpd)

It then creates the SANDPlayer object and defines a callback for stats update so it can update the
bandwidth graph.

Finally, it initializes the player and tells it to start playing when ready.

## Licence and Authors

All code and documentation is licensed by the original author and contributors under the Apache License v2.0:

* Cisco an/or its affiliates

<img src="https://2immerse.eu/wp-content/uploads/2016/04/2-IMM_150x50.png" align="left"/><em>This project was originally developed as part of the <a href="https://2immerse.eu/">2-IMMERSE</a> project, co-funded by the European Commission’s <a hef="http://ec.europa.eu/programmes/horizon2020/">Horizon 2020</a> Research Programme</em>

See AUTHORS file for a full list of individuals and organisations that have
contributed to this code.
