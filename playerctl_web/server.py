import subprocess
from flask import Flask, render_template, jsonify, request
from playerctl_web import syncplay_connection
from playerctl_web.config import IGNORE_LIST
from flask_caching import Cache

app = Flask(__name__)
cache = Cache(app, config={'CACHE_TYPE': 'simple'})

@cache.memoize(timeout=1)
def run_playerctl_cached(command, args=[], player=None):
    return run_playerctl(command, args, player)

def run_playerctl(command, args=[], player=None):
    ignore_args = [f"--ignore-player={player}" for player in IGNORE_LIST]
    player_arg = [f"--player={player}"] if player else []
    full_command = ["playerctl"] + ignore_args + player_arg + [command] + args
    try:
        output = subprocess.check_output(full_command, universal_newlines=True)
        return output.strip()
    except subprocess.CalledProcessError:
        return None

@app.route('/api/syncplay_playlist')
def get_syncplay_playlist():
    return jsonify({"playlist": syncplay_connection.get_playlist()})

@app.route('/api/syncplay_current')
def fetch_syncplay_current():
    return jsonify({"current_item": syncplay_connection.get_current_item()})

@app.route('/api/syncplay_playlist', methods=['POST'])
def update_syncplay_playlist():
    try:
        new_playlist = request.json['playlist']
        if syncplay_connection:
            syncplay_connection.update_playlist(new_playlist)
            return jsonify({"message": "Playlist updated successfully"}), 200
        else:
            return jsonify({"error": "Syncplay connection not initialized"}), 500
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/')
def index():
    players = get_players()
    return render_template('index.html', players=players)

@app.route('/api/players')
def get_players():
    players = run_playerctl_cached('--list-all')
    return players.split('\n') if players else []

@app.route('/api/status')
def get_status():
    player = request.args.get('player')
    result = run_playerctl_cached('status', player=player)
    return jsonify({"result": result})

@app.route('/api/<command>')
def api(command):
    player = request.args.get('player')
    valid_commands = ['play', 'pause', 'play-pause', 'next', 'previous']
    if command in valid_commands:
        result = run_playerctl(command, player=player)
        return jsonify({"result": result})
    return jsonify({"error": "Invalid command"}), 400

@app.route('/api/volume/<float:level>')
def set_volume(level):
    player = request.args.get('player')
    result = run_playerctl("volume", [f"{level:.2f}"], player=player)
    return jsonify({"result": "Volume set" if result else "Error setting volume"})

@app.route('/api/volume')
def get_volume():
    player = request.args.get('player')
    result = run_playerctl_cached("volume", player=player)
    if result:
        return jsonify({"volume": float(result)})
    return jsonify({"error": "Unable to get volume"}), 400

@app.route('/api/seek/<string:seconds>')
def seek(seconds):
    player = request.args.get('player')
    try:
        seconds = int(seconds)  # Convert to integer, allowing for negative values
        current_position = float(run_playerctl("position", player=player))
        new_position = max(0, current_position + seconds)
        result = run_playerctl("position", [str(new_position)], player=player)
        return jsonify({"result": "Position changed" if result else "Error changing position"})
    except ValueError:
        return jsonify({"error": "Invalid seek value"}), 400

@app.route('/api/seek_absolute/<int:position>')
def seek_absolute(position):
    player = request.args.get('player')
    try:
        result = run_playerctl("position", [str(position)], player=player)
        return jsonify({"result": "Position changed" if result else "Error changing position"})
    except ValueError:
        return jsonify({"error": "Unable to seek"}), 400

@app.route('/api/metadata')
def get_metadata():
    player = request.args.get('player')
    try:
        title = run_playerctl_cached("metadata", ["title"], player=player)
        artist = run_playerctl_cached("metadata", ["artist"], player=player)
        if artist is None:
            artist = 'Unknown Artist'
        if title is None:
            title = 'Unknown Title'
        length = run_playerctl_cached("metadata", ["mpris:length"], player=player)
        position = run_playerctl_cached("position", player=player)
        return jsonify({
            "title": title,
            "artist": artist,
            "length": int(length) // 1000000,  # Convert microseconds to seconds
            "position": int(float(position))
        })
    except (ValueError, subprocess.CalledProcessError, TypeError):
        return jsonify({"error": "Unable to get metadata"}), 400
