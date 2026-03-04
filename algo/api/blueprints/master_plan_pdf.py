# Master Plan PDF generation — in-memory, no disk caching.
# Generates an A4 PDF showing room-wise student roll number ranges.
import os
import re
import logging
from io import BytesIO
from flask import Blueprint, request, jsonify, send_file

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm, mm
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

from algo.services.auth_service import token_required
from algo.core.cache.cache_manager import CacheManager

cache_manager = CacheManager()

# Template manager import (for banner / header)
try:
    from algo.pdf_gen.template_manager import template_manager
except ImportError:
    template_manager = None

logger = logging.getLogger(__name__)

master_plan_bp = Blueprint('master_plan', __name__, url_prefix='/api')

# ---------------------------------------------------------------------------
# Branch-code → display-name mapping
# ---------------------------------------------------------------------------
BRANCH_MAP = {
    'CS': 'Computer Science & Engineering',
    'CD': 'Computer Science & Design',
    'IT': 'Information Technology',
    'ET': 'Electronics & Telecommunication',
    'EC': 'Electronics & Communication',
    'EE': 'Electrical Engineering',
    'ME': 'Mechanical Engineering',
    'CE': 'Civil Engineering',
}

# Short branch-code mapping for roll-number prefix detection
# Roll numbers like BTCS25O1001 → prefix "BTCS" → branch key "CS"
PREFIX_TO_BRANCH = {}
for code in BRANCH_MAP:
    PREFIX_TO_BRANCH[f'BT{code}'] = code
    PREFIX_TO_BRANCH[f'MT{code}'] = code


def _extract_roll_prefix(roll_number: str) -> str:
    """Extract the branch prefix from a roll number (e.g. BTCS25O1001 → BTCS)."""
    roll = roll_number.strip().upper()
    # Match 2-letter degree + 2-letter branch code
    m = re.match(r'^([A-Z]{4})', roll)
    return m.group(1) if m else roll[:4]


def _extract_numeric_suffix(roll_number: str) -> int:
    """Extract trailing digits from a roll number for natural sorting."""
    m = re.search(r'(\d+)$', str(roll_number))
    return int(m.group(1)) if m else 0


def _extract_master_plan_data(snapshot: dict) -> list:
    """
    Walk the multi-room cache and produce a flat list of row dicts:
      {branch_display, semester, room_no, from_roll, to_roll, total, is_onwards}

    Groups rows by branch across rooms to compute grand totals.
    
    Inter-branch "Onwards" logic:
    Within a single batch in a room, if the roll numbers have MIXED branch 
    prefixes (e.g. BTCS and BTET in the same batch), then 'to_roll' becomes 
    'Onwards' for that entry.
    """
    rooms_data = snapshot.get('rooms', {})
    active_rooms = snapshot.get('metadata', {}).get('active_rooms', list(rooms_data.keys()))

    # Collect rows keyed by (branch_code, joining_year) for grand-total grouping
    branch_rows = {}  # (branch_code, joining_year) → [row_dicts]

    for room_name in active_rooms:
        room = rooms_data.get(room_name)
        if not room:
            continue

        batches = room.get('batches', {})
        for batch_label, batch_data in batches.items():
            info = batch_data.get('info', {})
            branch_code = info.get('branch', '??')
            joining_year = info.get('joining_year', '2025')
            degree = info.get('degree', 'B.Tech')

            students = batch_data.get('students', [])
            if not students:
                continue

            # Collect valid roll numbers
            rolls = []
            for s in students:
                rn = s.get('roll_number', '').strip().upper()
                if rn and rn not in {'BROKEN', 'NONE', 'NULL', 'UNUSED', 'N/A'}:
                    rolls.append(rn)

            if not rolls:
                continue

            # Sort lexicographically — correct for both old (0901CD...) and new (BTCS...)
            # formats; numeric-only suffix sort mis-orders rolls across different year prefixes
            rolls.sort()

            # Detect inter-branch mixing within this batch
            prefixes = set(_extract_roll_prefix(r) for r in rolls)
            is_onwards = len(prefixes) > 1

            from_roll = rolls[0]
            to_roll = 'Onwards' if is_onwards else rolls[-1]

            branch_display = BRANCH_MAP.get(branch_code, branch_code)

            # Semester: compute from joining_year
            # (will be displayed; user can override via template if needed)
            semester = 'I'  # default for first-year

            key = (branch_display, joining_year)
            if key not in branch_rows:
                branch_rows[key] = []

            branch_rows[key].append({
                'branch_display': branch_display,
                'semester': semester,
                'room_no': room_name,
                'from_roll': from_roll,
                'to_roll': to_roll,
                'total': len(rolls),
            })

    # Flatten into ordered list with grand totals per branch group
    result = []
    serial = 1
    for (branch_display, joining_year), rows in branch_rows.items():
        grand_total = sum(r['total'] for r in rows)
        for i, row in enumerate(rows):
            row['serial'] = serial
            serial += 1
            # Only the last row in this branch group carries the grand total
            row['grand_total'] = grand_total if i == len(rows) - 1 else None
            # Only the first row shows the branch name (rowspan-like)
            row['show_branch'] = (i == 0)
            row['branch_row_count'] = len(rows) if i == 0 else 0
            result.append(row)

    return result


def _build_master_plan_pdf(
    snapshot: dict,
    user_id: str,
    dept_name: str,
    exam_name: str,
    date_text: str,
    title: str,
    left_sign_name: str,
    left_sign_title: str,
    right_sign_name: str,
    right_sign_title: str,
) -> BytesIO:
    """Build the Master Seating Plan PDF in-memory and return a BytesIO buffer."""

    rows = _extract_master_plan_data(snapshot)
    total_students = sum(r['total'] for r in rows)

    buffer = BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        topMargin=1.0 * cm,
        bottomMargin=1.5 * cm,
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm,
    )

    PAGE_WIDTH = A4[0]
    CONTENT_WIDTH = PAGE_WIDTH - doc.leftMargin - doc.rightMargin

    story = []
    styles = getSampleStyleSheet()

    # ------------------------------------------------------------------
    # 1. Banner Image
    # ------------------------------------------------------------------
    banner_path = None
    if template_manager:
        tpl = template_manager.get_user_template(user_id)
        banner_path = tpl.get('banner_image_path')

    # Resolve path
    PDF_GEN_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), 'pdf_gen')
    DEFAULT_BANNER = os.path.join(PDF_GEN_DIR, 'data', 'banner.png')

    resolved_banner = None
    if banner_path and os.path.isfile(banner_path):
        resolved_banner = banner_path
    elif os.path.isfile(DEFAULT_BANNER):
        resolved_banner = DEFAULT_BANNER

    if resolved_banner:
        try:
            img = Image(resolved_banner, width=CONTENT_WIDTH, height=2.8 * cm)
            img.hAlign = 'CENTER'
            story.append(img)
            story.append(Spacer(0, 0.2 * cm))
        except Exception as e:
            logger.warning(f"Could not load banner image: {e}")

    # ------------------------------------------------------------------
    # 2. Header Text
    # ------------------------------------------------------------------
    center_bold = styles['Normal'].clone('CenterBold')
    center_bold.alignment = TA_CENTER
    center_bold.fontName = 'Helvetica-Bold'
    center_bold.fontSize = 11

    center_normal = styles['Normal'].clone('CenterNormal')
    center_normal.alignment = TA_CENTER
    center_normal.fontSize = 10

    # Department
    story.append(Paragraph(f"<b>{dept_name}</b>", center_bold))
    story.append(Spacer(0, 0.05 * cm))
    # Exam name
    story.append(Paragraph(f"<b>{exam_name}</b>", center_normal))
    story.append(Spacer(0, 0.1 * cm))

    # Title (underlined)
    title_style = center_bold.clone('TitleStyle')
    title_style.fontSize = 12
    story.append(Paragraph(f"<u><b>{title}</b></u>", title_style))
    story.append(Spacer(0, 0.15 * cm))

    # Date
    story.append(Paragraph(f"<b>{date_text}</b>", center_normal))
    story.append(Spacer(0, 0.3 * cm))

    # ------------------------------------------------------------------
    # 3. Master Table
    # ------------------------------------------------------------------
    # Column headers (2-row header with merged "Enrollment Number")
    header_style = styles['Normal'].clone('TH')
    header_style.alignment = TA_CENTER
    header_style.fontName = 'Helvetica-Bold'
    header_style.fontSize = 9
    header_style.leading = 11

    cell_style = styles['Normal'].clone('TD')
    cell_style.alignment = TA_CENTER
    cell_style.fontSize = 9
    cell_style.leading = 11

    cell_left = cell_style.clone('TDLeft')
    cell_left.alignment = TA_LEFT

    # Build header rows
    h1 = [
        Paragraph('<b>S. No.</b>', header_style),
        Paragraph('<b>Branch</b>', header_style),
        Paragraph('<b>Semester</b>', header_style),
        Paragraph('<b>Room No.</b>', header_style),
        Paragraph('<b>Enrollment Number</b>', header_style),  # will span 2 cols
        '',  # placeholder for span
        Paragraph('<b>Total</b>', header_style),
        Paragraph('<b>Grand<br/>Total</b>', header_style),
    ]

    h2 = [
        '', '', '', '',
        Paragraph('<b>From</b>', header_style),
        Paragraph('<b>To</b>', header_style),
        '', '',
    ]

    table_data = [h1, h2]

    # Build data rows
    for row in rows:
        data_row = [
            Paragraph(str(row['serial']), cell_style),
            Paragraph(row['branch_display'] if row['show_branch'] else '', cell_left),
            Paragraph(row['semester'] if row['show_branch'] else '', cell_style),
            Paragraph(str(row['room_no']), cell_style),
            Paragraph(str(row['from_roll']), cell_style),
            Paragraph(str(row['to_roll']), cell_style),
            Paragraph(str(row['total']), cell_style),
            Paragraph(str(row['grand_total']) if row['grand_total'] is not None else '', cell_style),
        ]
        table_data.append(data_row)

    # Grand total row
    total_row = [
        '', '', '', '',
        Paragraph('<b>Total</b>', header_style),
        '',
        Paragraph(f'<b>{total_students}</b>', header_style),
        '',
    ]
    table_data.append(total_row)

    # Column widths
    col_widths = [
        0.8 * cm,    # S.No
        3.6 * cm,    # Branch  (-0.2 cm)
        1.7 * cm,    # Semester (+0.2 cm)
        1.5 * cm,    # Room No.
        3.5 * cm,    # From
        3.5 * cm,    # To
        1.2 * cm,    # Total
        1.2 * cm,    # Grand Total
    ]
    # Scale to fit content width
    total_col_w = sum(col_widths)
    if total_col_w < CONTENT_WIDTH:
        scale = CONTENT_WIDTH / total_col_w
        col_widths = [w * scale for w in col_widths]

    table = Table(table_data, colWidths=col_widths, repeatRows=2)

    num_data_rows = len(rows)
    total_table_rows = 2 + num_data_rows + 1  # 2 header + data + total row

    style_cmds = [
        # Grid
        ('GRID', (0, 0), (-1, -1), 0.8, colors.black),
        ('BOX', (0, 0), (-1, -1), 1.5, colors.black),

        # Header styling
        ('BACKGROUND', (0, 0), (-1, 1), colors.HexColor('#E8E8E8')),
        ('FONTNAME', (0, 0), (-1, 1), 'Helvetica-Bold'),
        ('FONTSIZE', (0, 0), (-1, 1), 9),
        ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),

        # Padding
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('RIGHTPADDING', (0, 0), (-1, -1), 4),

        # Header spans: "Enrollment Number" spans cols 4-5 in row 0
        ('SPAN', (4, 0), (5, 0)),
        # S.No, Branch, Semester, Room No, Total, Grand Total span rows 0-1
        ('SPAN', (0, 0), (0, 1)),
        ('SPAN', (1, 0), (1, 1)),
        ('SPAN', (2, 0), (2, 1)),
        ('SPAN', (3, 0), (3, 1)),
        ('SPAN', (6, 0), (6, 1)),
        ('SPAN', (7, 0), (7, 1)),

        # Total row: span cols 4-5 for "Total" label
        ('SPAN', (4, total_table_rows - 1), (5, total_table_rows - 1)),
        ('BACKGROUND', (0, total_table_rows - 1), (-1, total_table_rows - 1), colors.HexColor('#FFFFAA')),
        ('FONTNAME', (0, total_table_rows - 1), (-1, total_table_rows - 1), 'Helvetica-Bold'),
    ]

    # Grand total cells — highlight with yellow background
    for i, row in enumerate(rows):
        data_row_idx = i + 2  # offset by 2 header rows
        if row['grand_total'] is not None:
            style_cmds.append(('BACKGROUND', (7, data_row_idx), (7, data_row_idx), colors.HexColor('#FFFF00')))
            style_cmds.append(('FONTNAME', (7, data_row_idx), (7, data_row_idx), 'Helvetica-Bold'))

    # Branch column vertical spans (merge cells where branch repeats)
    current_row_offset = 2  # after 2 header rows
    for row in rows:
        if row['show_branch'] and row['branch_row_count'] > 1:
            span_end = current_row_offset + row['branch_row_count'] - 1
            style_cmds.append(('SPAN', (1, current_row_offset), (1, span_end)))
            style_cmds.append(('SPAN', (2, current_row_offset), (2, span_end)))
        current_row_offset += 1

    table.setStyle(TableStyle(style_cmds))
    story.append(table)

    # ------------------------------------------------------------------
    # 4. Signature Section
    # ------------------------------------------------------------------
    story.append(Spacer(0, 1.5 * cm))

    sign_style_name = styles['Normal'].clone('SignName')
    sign_style_name.fontName = 'Helvetica-Bold'
    sign_style_name.fontSize = 10

    sign_style_title = styles['Normal'].clone('SignTitle')
    sign_style_title.fontName = 'Helvetica'
    sign_style_title.fontSize = 9

    sign_data = [[
        Paragraph(f'<b>{left_sign_name}</b>', sign_style_name),
        '',
        Paragraph(f'<b>{right_sign_name}</b>', sign_style_name),
    ], [
        Paragraph(left_sign_title, sign_style_title),
        '',
        Paragraph(right_sign_title, sign_style_title),
    ]]

    sign_table = Table(sign_data, colWidths=[CONTENT_WIDTH * 0.4, CONTENT_WIDTH * 0.2, CONTENT_WIDTH * 0.4])
    sign_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, -1), 'LEFT'),
        ('ALIGN', (2, 0), (2, -1), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'TOP'),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 2),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(sign_table)

    # Build PDF
    doc.build(story)
    buffer.seek(0)
    logger.info(f"✅ Master Plan PDF generated in-memory for plan {snapshot.get('metadata', {}).get('plan_id', '?')}")
    return buffer


# ===========================================================================
# ENDPOINT
# ===========================================================================

@master_plan_bp.route('/generate-master-plan', methods=['POST'])
@token_required
def generate_master_plan():
    """Generate and return the Master Seating Plan PDF (in-memory, A4)."""
    try:
        data = request.get_json(silent=True) or {}
        plan_id = data.get('plan_id')

        if not plan_id:
            return jsonify({'error': 'plan_id is required'}), 400

        # Load cache snapshot
        snapshot = cache_manager.load_snapshot(plan_id)
        if not snapshot:
            return jsonify({'error': f'Plan {plan_id} not found in cache'}), 404

        # Check finalized status
        status = snapshot.get('metadata', {}).get('status', '')
        if status != 'FINALIZED':
            logger.warning(f"Master Plan requested for non-finalized plan {plan_id} (status={status})")
            # Allow anyway — but warn

        # User-provided fields (with sensible defaults)
        user_id = str(getattr(request, 'user_id', 'system'))
        dept_name = data.get('dept_name', 'Department of Computer Science & Engineering')
        exam_name = data.get('exam_name', 'Examination')
        date_text = data.get('date_text', '')
        title = data.get('title', 'Master Seating Plan')
        left_sign_name = data.get('left_sign_name', '')
        left_sign_title = data.get('left_sign_title', '')
        right_sign_name = data.get('right_sign_name', '')
        right_sign_title = data.get('right_sign_title', '')

        pdf_buffer = _build_master_plan_pdf(
            snapshot=snapshot,
            user_id=user_id,
            dept_name=dept_name,
            exam_name=exam_name,
            date_text=date_text,
            title=title,
            left_sign_name=left_sign_name,
            left_sign_title=left_sign_title,
            right_sign_name=right_sign_name,
            right_sign_title=right_sign_title,
        )

        download_name = f"master_plan_{plan_id}.pdf"
        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=download_name,
        )

    except Exception as e:
        logger.error(f"Master Plan PDF generation failed: {e}", exc_info=True)
        return jsonify({'error': f'PDF generation failed: {str(e)}'}), 500
