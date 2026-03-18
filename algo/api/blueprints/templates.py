# Template download endpoints.
# Serves sample CSV templates for file upload format guidance.
import logging
import os
from flask import Blueprint, send_from_directory, jsonify, Response, current_app

templates_bp = Blueprint('templates', __name__, url_prefix='/api/templates')
logger = logging.getLogger(__name__)


ALLOWED_TEMPLATE_FILES = ['students_mode1.csv', 'students_mode2.csv', 'CSE_Batch_10.csv']

DEFAULT_TEMPLATE_CONTENT = {
    'students_mode1.csv': (
        'Enrollment\n'
        'BTCS2501001\n'
        'BTCS2501002\n'
        'BTCS2501003\n'
    ),
    'students_mode2.csv': (
        'Name,Enrollment,Department\n'
        'Rahul Sharma,BTCS2501001,Computer Science\n'
        'Priya Patel,BTCS2501002,Computer Science\n'
        'Aman Verma,BIT2501003,Information Technology\n'
    ),
    'CSE_Batch_10.csv': (
        'Name,Enrollment,Department\n'
        'Student 01,BTCS2501001,Computer Science\n'
        'Student 02,BTCS2501002,Computer Science\n'
        'Student 03,BTCS2501003,Computer Science\n'
        'Student 04,BTCS2501004,Computer Science\n'
        'Student 05,BTCS2501005,Computer Science\n'
        'Student 06,BTCS2501006,Computer Science\n'
        'Student 07,BTCS2501007,Computer Science\n'
        'Student 08,BTCS2501008,Computer Science\n'
        'Student 09,BTCS2501009,Computer Science\n'
        'Student 10,BTCS2501010,Computer Science\n'
    ),
}

def get_templates_dir():
    """Get absolute path to templates directory"""
    # Start from this file's location: algo/api/blueprints/templates.py
    # Prefer algo/static/templates, fallback to project-root static/templates.
    this_dir = os.path.dirname(os.path.abspath(__file__))
    algo_dir = os.path.dirname(os.path.dirname(this_dir))
    project_root = os.path.dirname(algo_dir)

    candidates = [
        os.path.join(algo_dir, 'static', 'templates'),
        os.path.join(project_root, 'static', 'templates'),
    ]

    for path in candidates:
        if os.path.isdir(path):
            return path
    return candidates[0]


def ensure_default_templates(templates_dir):
    """Create template directory and seed default template files if missing."""
    os.makedirs(templates_dir, exist_ok=True)
    for filename, content in DEFAULT_TEMPLATE_CONTENT.items():
        file_path = os.path.join(templates_dir, filename)
        if not os.path.exists(file_path):
            with open(file_path, 'w', encoding='utf-8', newline='') as file_obj:
                file_obj.write(content)
            logger.info("Created missing template file: %s", file_path)

TEMPLATES_DIR = get_templates_dir()


@templates_bp.route('', methods=['GET'])
def list_templates():
    """List all available templates"""
    try:
        templates = []
        templates_dir = get_templates_dir()
        ensure_default_templates(templates_dir)

        for filename in ALLOWED_TEMPLATE_FILES:
            file_path = os.path.join(templates_dir, filename)
            if os.path.exists(file_path):
                mode = '1' if 'mode1' in filename else '2' if 'mode2' in filename else 'unknown'
                templates.append({
                    'filename': filename,
                    'mode': mode,
                    'description': 'Enrollment only' if mode == '1' else 'Name + Enrollment + Department',
                    'download_url': f'/api/templates/download/{filename}'
                })

        return jsonify({
            'success': True,
            'templates': templates,
            'templates_dir': templates_dir
        }), 200
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


@templates_bp.route('/download/<filename>', methods=['GET'])
def download_template(filename):
    """Download a specific template file"""
    try:
        if filename not in ALLOWED_TEMPLATE_FILES:
            return jsonify({'error': 'Template not found', 'allowed': ALLOWED_TEMPLATE_FILES}), 404

        templates_dir = get_templates_dir()
        ensure_default_templates(templates_dir)
        file_path = os.path.join(templates_dir, filename)

        if not os.path.exists(file_path):
            return jsonify({
                'error': f'Template file not found',
                'path': file_path,
                'dir_exists': os.path.exists(templates_dir),
                'dir_contents': os.listdir(templates_dir) if os.path.exists(templates_dir) else []
            }), 404

        return send_from_directory(
            templates_dir,
            filename,
            as_attachment=True,
            mimetype='text/csv'
        )
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@templates_bp.route('/preview/<filename>', methods=['GET'])
def preview_template(filename):
    """Preview a template file content"""
    try:
        if filename not in ALLOWED_TEMPLATE_FILES:
            return jsonify({'error': 'Template not found'}), 404

        templates_dir = get_templates_dir()
        ensure_default_templates(templates_dir)
        file_path = os.path.join(templates_dir, filename)
        if not os.path.exists(file_path):
            return jsonify({'error': 'Template file not found'}), 404
        
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
            lines = content.strip().split('\n')
            headers = lines[0].split(',') if lines else []
            rows = [line.split(',') for line in lines[1:]] if len(lines) > 1 else []
        
        return jsonify({
            'success': True,
            'filename': filename,
            'content': content,
            'headers': headers,
            'rows': rows[:10],  # First 10 rows for preview
            'total_rows': len(rows)
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@templates_bp.route('/format-info', methods=['GET'])
def get_format_info():
    """Return detailed format specification for uploads"""
    return jsonify({
        'success': True,
        'formats': {
            'mode1': {
                'name': 'Enrollment Only',
                'description': 'Simple list with just enrollment/roll numbers',
                'required_columns': ['Enrollment'],
                'accepted_headers': [
                    'enrollment', 'enrollmentno', 'enroll', 'enrollno', 
                    'roll', 'rollno', 'regno', 'registrationno', 
                    'studentid', 'id', 'matricno'
                ],
                'example': [
                    {'Enrollment': '21BCE1001'},
                    {'Enrollment': '21BCE1002'},
                    {'Enrollment': '22ECE2001'}
                ]
            },
            'mode2': {
                'name': 'Full Details',
                'description': 'Complete student info with name, enrollment, and department',
                'required_columns': ['Name', 'Enrollment'],
                'optional_columns': ['Department'],
                'accepted_name_headers': [
                    'name', 'studentname', 'fullname', 'candidate', 
                    'firstname', 'fname', 'student'
                ],
                'accepted_enrollment_headers': [
                    'enrollment', 'enrollmentno', 'enroll', 'enrollno',
                    'roll', 'rollno', 'regno', 'registrationno',
                    'studentid', 'id', 'matricno'
                ],
                'accepted_department_headers': [
                    'department', 'dept', 'branch', 'course', 
                    'program', 'stream', 'discipline'
                ],
                'example': [
                    {'Name': 'Rahul Sharma', 'Enrollment': '21BCE1001', 'Department': 'Computer Science'},
                    {'Name': 'Priya Patel', 'Enrollment': '21BCE1002', 'Department': 'Computer Science'}
                ]
            }
        },
        'file_requirements': {
            'allowed_extensions': ['csv', 'xlsx', 'xls'],
            'max_file_size_mb': 10,
            'encoding': 'UTF-8 (auto-detected)',
            'notes': [
                'First row must contain column headers',
                'Duplicate enrollments will be skipped',
                'Empty rows will be ignored',
                'Column names are case-insensitive'
            ]
        }
    }), 200
