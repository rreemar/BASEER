# BASEER 2 Dashboard

A browser dashboard for the existing BASEER 2 ROS 2 project. It does **not** invent new detection logic; it visualizes the topics already published by the project.

## Dashboard data sources

- `/baseer2/alerts` — `baseer2_interfaces/msg/Alert`
- `/baseer2/scada_event` — `std_msgs/msg/String`
- `/baseer2/sos_alert` — `std_msgs/msg/String`
- `/baseer2/gas_ppm` — `std_msgs/msg/Float32`
- `/baseer2/gps` — `sensor_msgs/msg/NavSatFix`
- `/baseer2/gas_vision/annotated` — `sensor_msgs/msg/Image`
- `/baseer2/fall_detection/annotated` — `sensor_msgs/msg/Image`

## 1. Start your Baseer 2 ROS 2 system

Use your normal Baseer 2 commands and make sure the detection nodes are publishing the topics above.

## 2. Install/start rosbridge

On Ubuntu + ROS 2 Humble:

```bash
sudo apt update
sudo apt install ros-humble-rosbridge-suite
source /opt/ros/humble/setup.bash
ros2 launch rosbridge_server rosbridge_websocket_launch.xml
```

The default WebSocket endpoint is `ws://localhost:9090`.

## 3. Start the dashboard

From this folder:

```bash
python3 -m http.server 8080
```

Open:

```text
http://localhost:8080
```

Click **CONNECT**.

## Demo mode

Click **DEMO MODE** (next to CONNECT) to preview the dashboard without a ROS backend. It fabricates
gas ppm, fall score, GPS drift, and occasional alerts, then feeds them through the exact same
render path as real ROS messages (map, sparklines, timeline, alert details all update). The status
dot, connection text, and an on-canvas "SIMULATED FEED" watermark make it unmistakable that the data
isn't real. Clicking CONNECT (or DEMO MODE again) stops the simulator.

## Live map

The Live Location panel is a real interactive map (Leaflet + CARTO dark tiles), plotting the drone's
marker and flight trail from `/baseer2/gps` in real time — the same kind of position view
QGroundControl shows, without requiring QGC to be running. It needs internet access to fetch map
tiles; if you're fully offline, swap the `tileLayer` URL in `app.js` for a self-hosted tile server.

## Trend charts

The gas ppm, fall score, and alert-rate metric tiles each carry a small trend sparkline, and the
Alert Timeline panel has a severity-lane scatter chart (critical/warning/info over time) above the
event list — both draw on plain `<canvas>`, no chart library required.

## Notes

- The dashboard uses `roslibjs` and `leaflet` from CDNs in `index.html`. If your environment is fully offline, download both into this folder and replace the CDN `<script>`/`<link>` tags with local files (map tiles still need internet unless self-hosted).
- Raw ROS `sensor_msgs/Image` frames are decoded in the browser. For high-resolution/high-FPS cameras, a compressed image transport or MJPEG/WebRTC pipeline would be more efficient.
