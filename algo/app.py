from flask import Flask, render_template_string, jsonify, request
from flask_cors import CORS
from pathlib import Path
from functools import wraps
import sys
import os

# Add Backend folder to path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'Backend'))

# Import the seating algorithm
from algo import SeatingAlgorithm

# Import authentication service
from auth_service import (
    login as auth_login,
    signup as auth_signup,
    get_user_by_token,
    update_user_profile,
    verify_token
)

app = Flask(__name__)
CORS(app)

# Load HTML template from the sibling index.html file
HTML_TEMPLATE = Path(__file__).with_name('index.html').read_text()


# ============================================================================
# AUTHENTICATION MIDDLEWARE & HELPER FUNCTIONS
# ============================================================================

def token_required(f):
    """Decorator to require valid token for protected routes."""
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        
        # Check for token in headers
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'error': 'Invalid token format'}), 401
        
        if not token:
            return jsonify({'error': 'Token missing'}), 401
        
        # Verify token
        payload = verify_token(token)
        if not payload:
            return jsonify({'error': 'Invalid or expired token'}), 401
        
        # Pass user_id to the route
        request.user_id = payload['user_id']
        return f(*args, **kwargs)
    
    return decorated


# ============================================================================
# AUTHENTICATION ENDPOINTS
# ============================================================================

@app.route('/api/auth/signup', methods=['POST'])
def signup():
    """Signup endpoint: create a new user account."""
    try:
        data = request.get_json()
        username = data.get('username', '').strip()
        email = data.get('email', '').strip()
        password = data.get('password', '')
        role = data.get('role', 'STUDENT')
        
        success, message = auth_signup(username, email, password, role)
        
        if success:
            return jsonify({'success': True, 'message': message}), 201
        else:
            return jsonify({'success': False, 'error': message}), 400
    
    except Exception as e:
        return jsonify({'error': f'Signup failed: {str(e)}'}), 500


@app.route('/api/auth/login', methods=['POST'])
def login():
    """Login endpoint: authenticate user and return token."""
    try:
        data = request.get_json()
        email = data.get('email', '').strip()
        password = data.get('password', '')
        
        success, user_data, result = auth_login(email, password)
        
        if success:
            # result is the token
            return jsonify({
                'success': True,
                'token': result,
                'user': user_data
            }), 200
        else:
            # result is the error message
            return jsonify({'success': False, 'error': result}), 401
    
    except Exception as e:
        return jsonify({'error': f'Login failed: {str(e)}'}), 500


@app.route('/api/auth/profile', methods=['GET'])
@token_required
def get_profile():
    """Get current user profile (protected route)."""
    try:
        user = get_user_by_token(request.headers['Authorization'].split(" ")[1])
        
        if not user:
            return jsonify({'error': 'User not found'}), 404
        
        return jsonify({
            'success': True,
            'user': user
        }), 200
    
    except Exception as e:
        return jsonify({'error': f'Failed to fetch profile: {str(e)}'}), 500


@app.route('/api/auth/profile', methods=['PUT'])
@token_required
def update_profile():
    """Update current user profile (protected route)."""
    try:
        data = request.get_json()
        username = data.get('username')
        email = data.get('email')
        
        success, message = update_user_profile(request.user_id, username, email)
        
        if success:
            user = get_user_by_token(request.headers['Authorization'].split(" ")[1])
            return jsonify({
                'success': True,
                'message': message,
                'user': user
            }), 200
        else:
            return jsonify({'success': False, 'error': message}), 400
    
    except Exception as e:
        return jsonify({'error': f'Failed to update profile: {str(e)}'}), 500


@app.route('/api/auth/logout', methods=['POST'])
def logout():
    """Logout endpoint (client-side token removal)."""
    return jsonify({'success': True, 'message': 'Logged out successfully'}), 200


# ============================================================================
# SEATING ALGORITHM ENDPOINTS
# ============================================================================

@app.route('/')
def index():
    """Main HTML page""" 
    return render_template_string(HTML_TEMPLATE)


@app.route('/api/generate-seating', methods=['POST'])
def generate_seating():
    """API endpoint to generate seating arrangement"""
    try:
        data = request.get_json()
        rows = int(data.get('rows', 10))
        cols = int(data.get('cols', 15))
        num_batches = int(data.get('num_batches', 3))
        block_width = int(data.get('block_width', 3))
        # flags
        batch_by_column = bool(data.get('batch_by_column', True))
        enforce_no_adjacent_batches = bool(data.get('enforce_no_adjacent_batches', False))
        
        # Parse broken seats (format: "row-col,row-col,...")
        broken_seats_str = data.get('broken_seats', '')
        broken_seats = []
        if broken_seats_str:
            parts = [p.strip() for p in broken_seats_str.split(',') if p.strip()]
            for part in parts:
                if '-' in part:
                    try:
                        row_col = part.split('-')
                        row = int(row_col[0].strip()) - 1  # Convert to 0-based indexing
                        col = int(row_col[1].strip()) - 1
                        if 0 <= row < rows and 0 <= col < cols:
                            broken_seats.append((row, col))
                    except (ValueError, IndexError):
                        pass
        
        # roll formatting options
        roll_template = data.get('roll_template')  # e.g. "{prefix}{year}O{serial}"
        batch_prefixes_csv = data.get('batch_prefixes', '')
        # parse comma-separated prefixes into dict {1: 'BTCS', 2: 'BTCD', ...}
        batch_prefixes = {}
        if batch_prefixes_csv:
            parts = [p.strip() for p in batch_prefixes_csv.split(',') if p.strip()]
            for i, p in enumerate(parts):
                batch_prefixes[i + 1] = p
        # If a roll_template is provided but not enough prefixes were supplied,
        # auto-fill remaining prefixes to avoid identical roll strings.
        if roll_template and len(batch_prefixes) < num_batches:
            for b in range(1, num_batches + 1):
                if b not in batch_prefixes:
                    batch_prefixes[b] = f'B{b}'
        year = data.get('year')
        try:
            year = int(year) if year is not None and year != '' else None
        except Exception:
            year = None
        start_serial = int(data.get('start_serial', 1))
        serial_width = int(data.get('serial_width', 0))
        # parse optional per-batch start serials like "1:1134,2:2000"
        start_serials_str = data.get('start_serials', '')
        start_serials = {}
        if start_serials_str:
            parts = [p.strip() for p in start_serials_str.split(',') if p.strip()]
            for part in parts:
                if ':' in part or '=' in part:
                    sep = ':' if ':' in part else '='
                    k, v = part.split(sep, 1)
                    try:
                        start_serials[int(k.strip())] = int(v.strip())
                    except Exception:
                        pass

        # parse optional per-batch start roll strings like "1:BTCS24O1135,2:BTCD24O2001"
        start_rolls_str = data.get('start_rolls', '')
        start_rolls = {}
        if start_rolls_str:
            parts = [p.strip() for p in start_rolls_str.split(',') if p.strip()]
            for part in parts:
                if ':' in part or '=' in part:
                    sep = ':' if ':' in part else '='
                    k, v = part.split(sep, 1)
                    try:
                        start_rolls[int(k.strip())] = v.strip()
                    except Exception:
                        pass

        serial_mode = data.get('serial_mode', 'per_batch')
        
        # Parse batch student counts (format: "1:35,2:30,3:25")
        batch_student_counts_str = data.get('batch_student_counts', '')
        batch_student_counts = {}
        if batch_student_counts_str:
            parts = [p.strip() for p in batch_student_counts_str.split(',') if p.strip()]
            for part in parts:
                if ':' in part:
                    try:
                        k, v = part.split(':', 1)
                        batch_student_counts[int(k.strip())] = int(v.strip())
                    except Exception:
                        pass
        
        # Parse batch colors (format: "1:#DBEAFE,2:#DCFCE7,3:#FEE2E2")
        batch_colors_str = data.get('batch_colors', '')
        batch_colors = {}
        if batch_colors_str:
            parts = [p.strip() for p in batch_colors_str.split(',') if p.strip()]
            for part in parts:
                if ':' in part:
                    try:
                        k, v = part.split(':', 1)
                        batch_colors[int(k.strip())] = v.strip()
                    except Exception:
                        pass

        # Validate inputs
        if rows < 1 or cols < 1 or num_batches < 1 or num_batches > 50:
            return jsonify({"error": "Invalid rows/cols/num_batches"}), 400
        if block_width < 1 or block_width > cols:
            return jsonify({"error": "Invalid block_width"}), 400

        # Generate seating; pass block_width so blocks are column-wide chunks
        algorithm = SeatingAlgorithm(
            rows, cols, num_batches,
            block_width=block_width,
            batch_by_column=batch_by_column,
            enforce_no_adjacent_batches=enforce_no_adjacent_batches,
            roll_template=roll_template,
            batch_prefixes=batch_prefixes,
            year=year,
            start_serial=start_serial,
            start_serials=start_serials,
            start_rolls=start_rolls,
            serial_width=serial_width,
            serial_mode=serial_mode,
            broken_seats=broken_seats,
            batch_student_counts=batch_student_counts,
            batch_colors=batch_colors,
        )
        seating_plan = algorithm.generate_seating()

        # Validate constraints
        is_valid, errors = algorithm.validate_constraints()

        # Convert to web format
        web_data = algorithm.to_web_format()
        web_data["validation"] = {
            "is_valid": is_valid,
            "errors": errors
        }
        
        # Add constraints status
        web_data["constraints_status"] = algorithm.get_constraints_status()

        return jsonify(web_data)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/validate-seating', methods=['POST'])
def validate_seating():
    """API endpoint to validate existing seating"""
    try:
        data = request.get_json()
        # Implementation for validating custom seating
        return jsonify({"is_valid": True, "errors": []})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/constraints-status', methods=['POST'])
def get_constraints_status():
    """API endpoint to get current constraints status"""
    try:
        data = request.get_json()
        rows = int(data.get('rows', 10))
        cols = int(data.get('cols', 15))
        num_batches = int(data.get('num_batches', 3))
        block_width = int(data.get('block_width', 3))
        batch_by_column = bool(data.get('batch_by_column', True))
        enforce_no_adjacent_batches = bool(data.get('enforce_no_adjacent_batches', False))
        
        # Parse broken seats
        broken_seats_str = data.get('broken_seats', '')
        broken_seats = []
        if broken_seats_str:
            parts = [p.strip() for p in broken_seats_str.split(',') if p.strip()]
            for part in parts:
                if '-' in part:
                    try:
                        row_col = part.split('-')
                        row = int(row_col[0].strip()) - 1
                        col = int(row_col[1].strip()) - 1
                        if 0 <= row < rows and 0 <= col < cols:
                            broken_seats.append((row, col))
                    except (ValueError, IndexError):
                        pass
        
        # Parse batch student counts
        batch_student_counts_str = data.get('batch_student_counts', '')
        batch_student_counts = {}
        if batch_student_counts_str:
            parts = [p.strip() for p in batch_student_counts_str.split(',') if p.strip()]
            for part in parts:
                if ':' in part:
                    try:
                        k, v = part.split(':', 1)
                        batch_student_counts[int(k.strip())] = int(v.strip())
                    except Exception:
                        pass
        
        # Create algorithm instance
        algorithm = SeatingAlgorithm(
            rows, cols, num_batches,
            block_width=block_width,
            batch_by_column=batch_by_column,
            enforce_no_adjacent_batches=enforce_no_adjacent_batches,
            broken_seats=broken_seats,
            batch_student_counts=batch_student_counts,
        )
        algorithm.generate_seating()
        
        # Return constraints status
        return jsonify(algorithm.get_constraints_status())
    except Exception as e:
        return jsonify({"error": str(e)}), 500



if __name__ == '__main__':
    app.run(debug=True)
