# pdf_gen/pdf_generation.py (UPDATED VERSION )
import io
import json
import os
import hashlib
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm, mm
from reportlab.pdfgen import canvas
from reportlab.pdfbase.pdfmetrics import stringWidth

# Import template manager with proper error handling
try:
    from .template_manager import template_manager
except ImportError:
    try:
        from template_manager import template_manager
    except ImportError:
        print("⚠️ Template manager not available, using fallback mode")
        template_manager = None

# Resolve absolute paths relative to this file
PDF_GEN_DIR = os.path.dirname(os.path.abspath(__file__))
CACHE_DIR = os.path.join(PDF_GEN_DIR, "seat_plan_generated")
IMAGE_PATH = os.path.join(PDF_GEN_DIR, "data", "banner.png")
CUSTOM_PAGE_SIZE = (364 * mm, 235 * mm)

def seating_payload_digest(data: dict, user_id: str = 'system', template_name: str = 'default') -> str:
    """Create hash including user template configuration"""
    seating_data_normalized = json.dumps(data, sort_keys=True, separators=(',', ':'))
    
    if template_manager:
        template_hash = template_manager.get_template_hash(user_id, template_name)
        combined = f"{seating_data_normalized}|{user_id}|{template_name}|{template_hash}"
    else:
        # Fallback without template system
        combined = seating_data_normalized
    
    return hashlib.sha256(combined.encode('utf-8')).hexdigest()

def get_or_create_seating_pdf(data: dict, user_id: str = 'system', template_name: str = 'default', cache_dir: str = CACHE_DIR) -> str:
    """Generate PDF with user-specific template and caching"""
    if data is None:
        raise ValueError("Seating data required")

    # Extract room number from seating data
    room_no = None
    # Try metadata first
    if 'metadata' in data and 'room_no' in data['metadata']:
        room_no = data['metadata']['room_no']
    # Fallback: extract from first student record
    elif 'seating' in data:
        for row in data['seating']:
            for seat in row:
                if seat and not seat.get('is_broken') and not seat.get('is_unallocated'):
                    room_no = seat.get('room_no')
                    if room_no:
                        break
            if room_no:
                break

    digest = seating_payload_digest(data, user_id, template_name)
    
    # Create user-specific cache directory if template manager available
    if template_manager and user_id != 'system':
        user_cache_dir = os.path.join(cache_dir, str(user_id))
        os.makedirs(user_cache_dir, exist_ok=True)
        filename = os.path.join(user_cache_dir, f"seating_plan_{digest}.pdf")
    else:
        # Fallback to original behavior
        os.makedirs(cache_dir, exist_ok=True)
        filename = os.path.join(cache_dir, f"seating_plan_{digest}.pdf")

    if not os.path.exists(filename):
        print(f"🔄 Generating new PDF for user: {user_id}")
        create_seating_pdf(filename=filename, data=data, user_id=user_id, template_name=template_name, room_no=room_no)
    else:
        print(f"♻️ Using cached PDF for user: {user_id}")
    
    return filename

def process_seating_data(json_data):
    """Returns (matrix, summary) where matrix is cell dicts and summary has counts"""
    seating_rows = json_data.get('seating', [])
    metadata = json_data.get('metadata', {})
    
    num_rows = metadata.get('rows', 0) or len(seating_rows)
    num_cols = metadata.get('cols', 0) or (len(seating_rows[0]) if seating_rows else 0)

    matrix = [[{'text': '', 'bg': None} for _ in range(num_cols)] for _ in range(num_rows)]
    
    # Initialize summary with roll number tracking
    summary = {
        'total_allocated': 0,
        'batch_counts': {},  # batch_label -> count
        'batch_roll_ranges': {}  # batch_label -> {'rolls': [...]}
    }

    for r in range(num_rows):
        if r >= len(seating_rows): continue
        row = seating_rows[r]
        for c in range(num_cols):
            if c >= len(row): continue
            seat = row[c]
            
            if seat.get('is_broken'):
                content = seat.get('display', 'BROKEN')
                bg = seat.get('color', '#FF0000')
            elif seat.get('is_unallocated'):
                content = seat.get('display', 'UNALLOC')
                bg = seat.get('color', '#F3F4F6')
            else:
                roll = seat.get('roll_number', '')
                pset = seat.get('paper_set', '')
                content = f"{roll}\nSET {pset}" if roll else ''
                bg = seat.get('color')
                
                
                if roll:
                    # Filter out invalid roll numbers that might be present in data
                    roll_str = str(roll).strip().upper()
                    invalid_values = {'BROKEN', 'NONE', 'NULL', 'UNUSED', 'N/A', 'VOID'}
                    
                    if roll_str not in invalid_values:
                        summary['total_allocated'] += 1
                        label = seat.get('batch_label') or f"Batch {seat.get('batch', 'Unknown')}"
                        summary['batch_counts'][label] = summary['batch_counts'].get(label, 0) + 1
                        
                        # Track roll numbers for range calculation
                        if label not in summary['batch_roll_ranges']:
                            summary['batch_roll_ranges'][label] = {'rolls': []}
                        summary['batch_roll_ranges'][label]['rolls'].append(roll_str)
                
            matrix[r][c] = {'text': content, 'bg': bg}
    
    # Process roll number ranges - sort and extract first/last
    import re

    def extract_branch_prefix(roll_no):
        """Extract branch prefix for mixed-batch detection (handles both roll formats).
        New format: BTCS24O1138 → BTCS | Old format: 0901CD231014 → CD"""
        roll = str(roll_no).strip().upper()
        m = re.match(r'^([A-Z]+)', roll)
        if m:
            return m.group(1)
        m = re.match(r'^\d+([A-Z]+)', roll)
        if m:
            return m.group(1)
        return roll[:4]

    for label, range_info in summary['batch_roll_ranges'].items():
        rolls = range_info['rolls']
        if rolls:
            # Sort lexicographically — works correctly for both old (0901CD...) and
            # new (BTCS...) formats; numeric-only suffix sort fails across year prefixes
            sorted_rolls = sorted(rolls)
            range_info['first'] = sorted_rolls[0]
            range_info['last'] = sorted_rolls[-1]
            # If multiple branch prefixes exist → lateral/interbranch mix → show 'onwards'
            prefixes = set(extract_branch_prefix(r) for r in sorted_rolls)
            range_info['is_onwards'] = len(prefixes) > 1
    
    # Extract branch information with year from batches data
    batches_data = json_data.get('batches', {})
    branch_year_combos = set()  # e.g., ("CS", "2024"), ("CS", "2025")
    degrees = set()
    
    for batch_label, batch_info in batches_data.items():
        info = batch_info.get('info', {})
        if info.get('branch') and info.get('joining_year'):
            branch_year_combos.add((info['branch'], info['joining_year']))
        if info.get('degree'):
            degrees.add(info['degree'])
    
    # Store branch-year info in summary
    summary['branch_year_info'] = {
        'branch_year_combos': sorted(list(branch_year_combos)),
        'degrees': sorted(list(degrees))
    }
    
    return matrix, summary
def format_cell_content(raw, style):
    if not raw.strip():
        return ''
    parts = raw.strip().split('\n')
    if len(parts) == 2:
        text = f"<b>{parts[0]}</b><br/>{parts[1]}"
    else:
        text = f"<b>{parts[0]}</b>"
    return Paragraph(text, style)

def create_seating_pdf(filename="algo/pdf_gen/seat_plan_generated/seating_plan.pdf", data=None, user_id: str = 'system', template_name: str = 'default', room_no: str = None):
    """Generate PDF using user's specific template or fallback to default"""
    if data is None:
        raise ValueError("Seating data required")
    
    # Use provided room_no or fallback to "N/A"
    room_no = room_no or "N/A"
    
    # Load user's template configuration or use defaults
    if template_manager:
        template_config = template_manager.get_user_template(user_id, template_name)
        print(f"📋 Using template for user {user_id}: {template_config.get('dept_name', 'Default')}")
    else:
        # Fallback template config (no room_number field)
        template_config = {
            'dept_name': 'Department of Computer Science & Engineering',
            'exam_details': 'Minor-II Examination (2025 Admitted), November 2025',
            'seating_plan_title': 'Seating Plan',
            'branch_text': 'Branch: B.Tech(CSE & CSD Ist year)',
            'coordinator_name': 'Dr. Dheeraj K. Dixit',
            'coordinator_title': 'Dept. Exam Coordinator',
            'banner_image_path': IMAGE_PATH
        }
    
    seating_matrix, summary_stats = process_seating_data(data)
    metadata = data.get('metadata', {})
    
    def header_and_footer(c, doc):
        c.saveState()
        page_width, page_height = dynamic_page_size
        BANNER_HEIGHT = 3.5 * cm
        CONTENT_WIDTH = page_width - doc.leftMargin - doc.rightMargin
        
        # Use template's banner image path
        banner_path = template_config.get('banner_image_path')
        
        # Robust path resolution
        resolved_path = None
        
        # 1. Try stored path if it exists and is valid
        if banner_path and isinstance(banner_path, str) and banner_path.strip():
            candidate = banner_path
            if not os.path.isabs(candidate):
                candidate = os.path.join(PDF_GEN_DIR, candidate)
            
            if os.path.exists(candidate) and os.path.isfile(candidate):
                resolved_path = candidate
        
        # 2. Fallback to system default if storage check failed
        if not resolved_path:
            resolved_path = IMAGE_PATH
            
        try:
            if resolved_path and os.path.exists(resolved_path) and os.path.isfile(resolved_path):
                c.drawImage(resolved_path,
                            x=doc.leftMargin,
                            y=page_height - doc.topMargin - 0.3 * cm,
                            width=CONTENT_WIDTH,
                            height=BANNER_HEIGHT,
                            preserveAspectRatio=True)
            else:
                raise FileNotFoundError(f"Banner file not found: {resolved_path}")
        except Exception as e:
            print(f"⚠️ PDF Header Error: {e}")
            c.setFont('Helvetica-Bold', 12)
            c.drawCentredString(page_width / 2, page_height - doc.topMargin + 1.2 * cm,
                                f"Header image missing")
        
        # --- BATCH SUMMARY (BOTTOM LEFT) ---
        # Add heading
        c.setFont('Times-Bold', 13)  # +3 from summary font size (10)
        stats_x = doc.leftMargin
        current_y = doc.bottomMargin / 2 + 20
        c.drawString(stats_x, current_y, "Allocation Summary")
        
        # Summary content
        c.setFont('Times-Roman', 10)
        current_y -= 12  # Move down from heading
        c.drawString(stats_x, current_y, f"Total Students: {summary_stats['total_allocated']}")
        
        # Build batch summary with roll number ranges
        batch_line_items = []
        for label, count in summary_stats['batch_counts'].items():
            roll_range_info = summary_stats.get('batch_roll_ranges', {}).get(label)
            if roll_range_info and roll_range_info.get('first'):
                first_roll = roll_range_info['first']
                if roll_range_info.get('is_onwards'):
                    # Mixed branch / lateral entry — show open-ended range
                    batch_line_items.append(f"{first_roll} - onwards ({count})")
                else:
                    last_roll = roll_range_info.get('last', '')
                    batch_line_items.append(f"{first_roll} - {last_roll} ({count})")
            else:
                # Fallback to label: count format
                batch_line_items.append(f"{label}: {count}")
        
        # Display batches with max 2 per line
        if len(batch_line_items) > 0:
            current_y -= 10
            # Group batches into lines of max 2
            for i in range(0, len(batch_line_items), 2):
                batch_group = batch_line_items[i:i+2]
                batch_text = " | ".join(batch_group)
                c.drawString(stats_x, current_y, batch_text)
                current_y -= 10  # Move to next line for next group

        # --- COORDINATOR (BOTTOM RIGHT) ---
        c.setFont('Helvetica', 9)
        footer_x = page_width - doc.rightMargin
        footer_y = doc.bottomMargin / 2
        c.drawRightString(footer_x, footer_y + 8, template_config.get('coordinator_name', 'Dr. Dheeraj K. Dixit'))
        c.drawRightString(footer_x, footer_y, template_config.get('coordinator_title', 'Dept. Exam Coordinator'))
        c.restoreState()
    
    # Parameters for layout
    num_cols = metadata.get('cols', 0) or (len(seating_matrix[0]) if seating_matrix else 0)
    num_rows = metadata.get('rows', 0) or len(seating_matrix)
    
    # ✅ Support variable block widths via block_structure
    block_structure = metadata.get('block_structure')  # e.g., [3, 2, 3, 2]
    block_width = metadata.get('block_width', 2)  # Default fallback
    
    # Build aisle_positions: columns AFTER which an aisle appears (0-indexed)
    aisle_after_cols = []
    if block_structure and isinstance(block_structure, list) and len(block_structure) > 0:
        # Variable block widths: calculate cumulative positions
        import math
        cumulative = 0
        for i, width in enumerate(block_structure[:-1]):  # All but last block
            cumulative += width
            aisle_after_cols.append(cumulative - 1)  # 0-indexed column
        num_blocks = len(block_structure)
        # Build block ranges for headers/styling: [(start, end), ...]
        block_ranges = []
        col_start = 0
        for width in block_structure:
            col_end = min(col_start + width - 1, num_cols - 1)
            if col_start < num_cols:
                block_ranges.append((col_start, col_end))
            col_start += width
    elif block_width and block_width > 0 and num_cols > 0:
        # Uniform block_width: calculate standard aisle positions
        import math
        num_blocks = math.ceil(num_cols / block_width)
        block_ranges = []
        for i in range(num_blocks):
            start = i * block_width
            end = min((i + 1) * block_width - 1, num_cols - 1)
            block_ranges.append((start, end))
            if end < num_cols - 1:  # Not the last column
                aisle_after_cols.append(end)
    else:
        num_blocks = metadata.get('blocks', 1)
        block_ranges = [(0, num_cols - 1)]
    
    print(f"📊 PDF Generation - Cols: {num_cols}, Block Structure: {block_structure}, Num Blocks: {num_blocks}")

    # -- Dynamic page width & cell L/R padding ---------------------------
    # <= 14 cols : default page, default padding (3 pt each side)
    # 15-16 cols : widen page by 22 mm per extra col above 14; L/R padding -> 2 pt
    # 17 cols    : widen page (max); L/R padding -> 1 pt
    # > 17 cols  : page stays at default; L/R padding stays 1 pt
    _DEF_W, _DEF_H = CUSTOM_PAGE_SIZE
    if num_cols <= 14:
        dynamic_page_size = (_DEF_W, _DEF_H)
        lr_padding = 3
    elif num_cols <= 16:
        dynamic_page_size = (_DEF_W + (num_cols - 14) * 22 * mm, _DEF_H)
        lr_padding = 2
    elif num_cols <= 17:
        dynamic_page_size = (_DEF_W + (num_cols - 14) * 22 * mm, _DEF_H)
        lr_padding = 1
    else:
        dynamic_page_size = (_DEF_W, _DEF_H)
        lr_padding = 1
    print(f"📄 Page: {dynamic_page_size[0]/mm:.0f}x{dynamic_page_size[1]/mm:.0f}mm  L/R padding: {lr_padding}pt")
    # --------------------------------------------------------------------

    doc = SimpleDocTemplate(
        filename,
        pagesize=dynamic_page_size,
        topMargin=3.5 * cm,
        bottomMargin=2.0 * cm,
        leftMargin=1.5 * cm,
        rightMargin=1.5 * cm
    )
    story = []
    styles = getSampleStyleSheet()

    cell_style = styles['Normal'].clone('Cell')
    cell_style.fontSize = 9
    cell_style.alignment = 1
    cell_style.leading = 12
    cell_style.fontName = 'Helvetica-Bold'

    header_style = styles['Normal'].clone('Header')
    header_style.fontSize = 12
    header_style.alignment = 1
    header_style.fontName = 'Helvetica-Bold'

    story.append(Spacer(0, 0.2 * cm))
    
    # Use template values
    dept_style = styles['Normal'].clone('Dept')
    dept_style.fontSize = 13
    dept_style.alignment = 1
    story.append(Paragraph(f"<b>{template_config.get('dept_name')}</b>", dept_style))
    
    story.append(Spacer(0, 0.15 * cm))
    exam_style = styles['Normal'].clone('Exam')
    exam_style.fontSize = 12
    exam_style.alignment = 1
    story.append(Paragraph(template_config.get('exam_details'), exam_style))
    
    title_style = styles['Heading4'].clone('Title')
    title_style.alignment = 1
    title_style.fontSize = 18
    story.append(Paragraph(f"<b>{template_config.get('seating_plan_title')}</b>", title_style))

    br_style = styles['Normal'].clone('BR')
    br_style.fontSize = 12
    br_style.fontName = 'Helvetica-Bold'
    
    # Construct dynamic branch text from cache data with year grouping
    # Get current year from template (default to current year if not set)
    from datetime import datetime
    current_year = int(template_config.get('current_year', datetime.now().year))
    
    branch_year_info = summary_stats.get('branch_year_info', {})
    branch_year_combos = branch_year_info.get('branch_year_combos', [])
    degrees = branch_year_info.get('degrees', [])
    
    if branch_year_combos and degrees:
        # Branch code expansion mapping: CS -> CSE, CD -> CSD, etc.
        branch_expansion = {
            'CS': 'CSE',
            'CD': 'CSD',
            'IT': 'IT',
            'EC': 'ECE',
            'EE': 'EEE',
            'ME': 'ME',
            'CE': 'CE'
        }
        
        # Group branches by year
        year_to_branches = {}  # {1: ['CSE', 'CSD'], 2: ['CSE', 'CSD']}
        
        for branch_code, joining_year in branch_year_combos:
            expanded_branch = branch_expansion.get(branch_code, branch_code)
            
            # Calculate year: max(1, current_year - joining_year)
            year_diff = current_year - int(joining_year)
            year = 1 if year_diff <= 0 else year_diff
            
            if year not in year_to_branches:
                year_to_branches[year] = []
            year_to_branches[year].append(expanded_branch)
        
        # Build grouped branch-year strings: [CSE & CSD - 1yr] & [CSE & CSD - 2yr]
        year_groups = []
        for year in sorted(year_to_branches.keys()):
            branches_list = sorted(year_to_branches[year])
            branches_str = ' & '.join(branches_list)
            year_groups.append(f"[{branches_str} - {year}yr]")
        
        # Format: "Branch: B.Tech([CSE & CSD - 1yr] & [CSE & CSD - 2yr])"
        branch_text = f"Branch: {degrees[0]}({' & '.join(year_groups)})"
    else:
        # Fallback to template if no branch info available
        branch_text = template_config.get('branch_text', 'Branch: N/A')
    
    branch = Paragraph(f"<b>{branch_text}</b>", br_style)
    room_text = f"Room no. {room_no}"
    room = Paragraph(f"<b>{room_text}</b>", br_style)
    
    page_width = dynamic_page_size[0]
    content_width = page_width - doc.leftMargin - doc.rightMargin

    room_width = stringWidth(room_text, "Helvetica-Bold", 12) + 10
    room_width = min(room_width, content_width)
    branch_col_width = content_width - room_width 

    br_table = Table([[branch, room]], colWidths=[branch_col_width, room_width])
    br_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 0),
        ('RIGHTPADDING', (0, 0), (-1, -1), 0),
        ('TOPPADDING', (0, 0), (-1, -1), 0),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 0),
    ]))
    story.append(Spacer(0, 0.3 * cm))  # Reduced from 0.5cm
    story.append(br_table)
    story.append(Spacer(0, 0.2 * cm))  # Reduced from 0.4cm

    # Build the seating table with proper block separation
    if num_cols > 0 and num_rows > 0:
        table_content = []
        style_cmds = []

        # ✅ Create block header row using block_ranges
        block_header_row = [''] * num_cols
        for block_idx, (start_col, end_col) in enumerate(block_ranges):
            if start_col < num_cols:
                block_header_row[start_col] = Paragraph(f"<b>Block {block_idx + 1}</b>", header_style)

        table_content.append(block_header_row)

        # ✅ Add SPAN and background for block headers using block_ranges
        for block_idx, (start_col, end_col) in enumerate(block_ranges):
            if start_col <= end_col and start_col < num_cols:
                style_cmds.append(('SPAN', (start_col, 0), (end_col, 0)))
                style_cmds.append(('BACKGROUND', (start_col, 0), (end_col, 0), colors.HexColor("#D0D0D0")))
                style_cmds.append(('BOX', (start_col, 0), (end_col, 0), 2.5, colors.black))

        # Add seating data rows
        for row in seating_matrix:
            table_content.append([format_cell_content(cell['text'], cell_style) for cell in row])

        col_width = content_width / num_cols + 6
        table = Table(table_content, colWidths=[col_width] * num_cols)

        # Dynamic padding based on number of rows to fit 10 rows per page
        # When rows <= 10, use smaller padding to fit all on one page
        # When rows > 10, still use smaller padding for consistent appearance
        if num_rows <= 10:
            cell_padding = 4  # Reduced padding to fit 10 rows
        else:
            cell_padding = 4  # Keep same padding for consistency
        
        # Base table styling with dynamic padding
        style_cmds.extend([
            ('GRID', (0, 0), (-1, -1), 1.0, colors.black),  # Normal grid
            ('ALIGN', (0, 0), (-1, -1), 'CENTER'),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('FONTNAME', (0, 0), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('TOPPADDING', (0, 0), (-1, -1), cell_padding),
            ('BOTTOMPADDING', (0, 0), (-1, -1), cell_padding),
            ('LEFTPADDING', (0, 0), (-1, -1), lr_padding),
            ('RIGHTPADDING', (0, 0), (-1, -1), lr_padding),
        ])

        # ✅ Add THICK BORDERS between blocks (visual separation) using block_ranges
        if num_blocks > 1:
            for block_idx, (start_col, end_col) in enumerate(block_ranges):
                if start_col < num_cols:
                    # Left border of block (thick) - except for first block
                    if start_col > 0:
                        style_cmds.append(('LINEAFTER', (start_col - 1, 0), (start_col - 1, -1), 3.0, colors.black))
                    
                    # Box around entire block
                    style_cmds.append(('BOX', (start_col, 0), (end_col, -1), 2.5, colors.black))
            
            # Outer box for the entire table
            style_cmds.append(('BOX', (0, 0), (-1, -1), 3.0, colors.black))

        # Apply cell background colors
        for r_idx, row in enumerate(seating_matrix, start=1):
            for c_idx, cell in enumerate(row):
                bg = cell.get('bg')
                if bg:
                    try:
                        style_cmds.append(('BACKGROUND', (c_idx, r_idx), (c_idx, r_idx), colors.HexColor(bg)))
                    except Exception:
                        pass  # Skip invalid colors

        table.setStyle(TableStyle(style_cmds))
        
        # Split table to ensure max 10 rows per page
        table._splitByRow = True
        table._maxRowsPerPage = 10
        
        story.append(table)

    doc.build(story, onFirstPage=header_and_footer, onLaterPages=header_and_footer)
    print(f"✅ PDF generated: {filename}")
    return filename


def generate_seating_pdf_to_buffer(
    data: dict,
    user_id: str = 'system',
    template_name: str = 'default',
    room_no: str = None
) -> io.BytesIO:
    """
    Generate a seating-plan PDF entirely in memory and return a BytesIO buffer.

    Bypasses the L2 disk cache completely — every call produces a fresh PDF
    that is streamed directly to the caller without touching the filesystem.

    Args:
        data:          Seating payload (same shape accepted by create_seating_pdf).
        user_id:       Used to select the user's template configuration.
        template_name: Template name to pass to template_manager.
        room_no:       Optional room label; auto-extracted from data when omitted.

    Returns:
        BytesIO buffer positioned at byte 0, ready for send_file / read.
    """
    if data is None:
        raise ValueError("Seating data is required")

    # Extract room_no from payload when not explicitly supplied
    if room_no is None:
        if 'metadata' in data and 'room_no' in data['metadata']:
            room_no = data['metadata']['room_no']
        elif 'seating' in data:
            for _row in data['seating']:
                for _seat in _row:
                    if _seat and not _seat.get('is_broken') and not _seat.get('is_unallocated'):
                        room_no = _seat.get('room_no')
                        if room_no:
                            break
                if room_no:
                    break

    buffer = io.BytesIO()
    # ReportLab's SimpleDocTemplate accepts any file-like object as first argument
    create_seating_pdf(
        filename=buffer,
        data=data,
        user_id=user_id,
        template_name=template_name,
        room_no=room_no
    )
    buffer.seek(0)
    return buffer
    
    