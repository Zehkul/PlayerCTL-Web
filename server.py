#!/bin/python
from flask import Flask, render_template, jsonify, request
import subprocess
import json

app = Flask(__name__)

# Load ignore list from a JSON file
def load_ignore_list():
    try:
        with open('ignore_list.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return ["kdeconnect"]  # Default ignore list

# Save ignore list to a JSON file
def save_ignore_list(ignore_list):
    with open('ignore_list.json', 'w') as f:
        json.dump(ignore_list, f)

# Initialize ignore list
IGNORE_LIST = load_ignore_list()

def run_playerctl(command, args=[]):
    ignore_args = [f"--ignore-player={player}" for player in IGNORE_LIST]
    full_command = ["playerctl"] + ignore_args + [command] + args
    try:
        output = subprocess.check_output(full_command, universal_newlines=True)
        return output.strip()
    except subprocess.CalledProcessError:
        return None

@app.route('/')
def index():
    return render_template('index.html', ignore_list=IGNORE_LIST)

@app.route('/api/<command>')
def api(command):
    valid_commands = ['play', 'pause', 'play-pause', 'next', 'previous', 'status', 'metadata']
    if command in valid_commands:
        result = run_playerctl(command)
        return jsonify({"result": result})
    return jsonify({"error": "Invalid command"}), 400

@app.route('/api/volume/<float:level>')
def set_volume(level):
    result = run_playerctl("volume", [f"{level:.2f}"])
    return jsonify({"result": "Volume set" if result != "Error executing command" else "Error setting volume"})

@app.route('/api/volume')
def get_volume():
    result = run_playerctl("volume")
    if result != "Error executing command":
        return jsonify({"volume": float(result)})
    return jsonify({"error": "Unable to get volume"}), 400

@app.route('/api/seek/<int:seconds>')
def seek(seconds):
    try:
        current_position = float(run_playerctl("position"))
        new_position = max(0, current_position + seconds)
        result = run_playerctl("position", [str(new_position)])
        return jsonify({"result": "Position changed" if result != "Error executing command" else "Error changing position"})
    except ValueError:
        return jsonify({"error": "Unable to seek"}), 400

@app.route('/api/seek_absolute/<int:position>')
def seek_absolute(position):
    try:
        result = run_playerctl("position", [str(position)])
        return jsonify({"result": "Position changed" if result != "Error executing command" else "Error changing position"})
    except ValueError:
        return jsonify({"error": "Unable to seek"}), 400

@app.route('/api/metadata')
def get_metadata():
    try:
        title = run_playerctl("metadata", ["title"])
        artist = run_playerctl("metadata", ["artist"])
        if artist is None:
            artist = 'Unknown Artist'
        if title is None:
            title = 'Unknown Title'
        length = run_playerctl("metadata", ["mpris:length"])
        position = run_playerctl("position")
        return jsonify({
            "title": title,
            "artist": artist,
            "length": int(length) // 1000000,  # Convert microseconds to seconds
            "position": int(float(position))
        })
    except (ValueError, subprocess.CalledProcessError):
        return jsonify({"error": "Unable to get metadata"}), 400

@app.route('/api/ignore_list', methods=['GET', 'POST'])
def manage_ignore_list():
    global IGNORE_LIST
    if request.method == 'POST':
        IGNORE_LIST = request.json['ignore_list']
        save_ignore_list(IGNORE_LIST)
        return jsonify({"result": "Ignore list updated"})
    else:
        return jsonify({"ignore_list": IGNORE_LIST})

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000)
