import json
import os
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import cm

# --- CONFIGURATION ---
# Use paths relative to this file's location (works on any OS)
_BASE_DIR = Path(__file__).resolve().parent
IMAGE_PATH = str(_BASE_DIR / "data" / "banner.png")
CACHE_DIR = str(_BASE_DIR.parent / "cache") 

def header_and_footer(c, doc, room_no):
    """Restored original header/footer logic with banner image"""
    c.saveState()
    page_width, page_height = A4
    BANNER_HEIGHT = 3.2 * cm
    CONTENT_WIDTH = page_width - doc.leftMargin - doc.rightMargin 
    
    try:
        c.drawImage(IMAGE_PATH,
                    x=doc.leftMargin - 0.8*cm,
                    y=page_height - doc.topMargin - 0.3* cm,
                    width=CONTENT_WIDTH +50,
                    height=BANNER_HEIGHT,
                    preserveAspectRatio=True)
    except Exception:
        c.setFont('Times-Bold', 12)
        c.drawCentredString(page_width / 2, page_height - 2*cm, "Header Image Missing")

    room_box_width = 3.1 * cm
    room_box_height = 0.65 * cm
    c.rect(page_width - doc.rightMargin - room_box_width + 14, 
           page_height - 0.98 * cm, 
           room_box_width, room_box_height)
    
    c.setFont('Times-Roman', 10)
    c.drawString(page_width - doc.rightMargin - room_box_width + 17, 
                 page_height - 0.8 * cm, f"Room No. {room_no}")
    c.restoreState()

def create_attendance_pdf(filename, student_list, batch_label, metadata, extracted_info, template_config=None):
    """Generate attendance PDF using metadata configuration"""
    from datetime import datetime
    from reportlab.platypus import Image as ReportLabImage # Alias to avoid conflict with other Image
    
    # Use metadata values for attendance settings (passed from frontend)
    # Fallback to template config if metadata doesn't have these fields
    attendance_dept_name = metadata.get('attendance_dept_name', 'Computer Science and Engineering')
    
    # Academic year is ONLY for calculating student year (1yr, 2yr, etc.)
    # PDF should always show current year
    current_year = datetime.now().year
    academic_year_for_calculation = int(metadata.get('attendance_year', current_year))
    
    attendance_exam_heading = metadata.get('attendance_exam_heading', ' EXAMINATION')
    banner_path = metadata.get('attendance_banner_path', IMAGE_PATH)
    
    # If banner path is empty, use default IMAGE_PATH
    if not banner_path or banner_path.strip() == '':
        banner_path = IMAGE_PATH
    
    # Branch code expansion mapping (same as seating plan)
    branch_expansion = {
        'CS': 'CSE',
        'CD': 'CSD',
        'IT': 'IT',
        'EC': 'ECE',
        'EE': 'EEE',
        'ME': 'ME',
        'CE': 'CE'
    }
    
    # Extract and expand branch name
    branch_code = extracted_info.get('branch', 'N/A')
    expanded_branch = branch_expansion.get(branch_code, branch_code)
    
    # Calculate year suffix using academic_year_for_calculation
    joining_year = int(extracted_info.get('joining_year', academic_year_for_calculation))
    year_diff = academic_year_for_calculation - joining_year
    year_suffix = 1 if year_diff <= 0 else year_diff
    
    # Build dynamic department header
    dept_header = f"Department of {attendance_dept_name}"
    
    doc = SimpleDocTemplate(
        filename,
        pagesize=A4,
        topMargin=3.8 * cm,  # Original margins to accommodate header
        bottomMargin=2.0 * cm,
        leftMargin=1.2 * cm,
        rightMargin=1.2 * cm
    )
    
    story = []
    styles = getSampleStyleSheet()
    
    # Set font to Times-Roman for all styles
    for style in styles.byName.values():
        style.fontName = 'Times-Roman'

    header_style = styles['Normal'].clone('HeaderStyle')
    header_style.alignment = 1 
    
    # Department header
    story.append(Paragraph(f"<u><b>{dept_header}</b></u>", header_style))
    story.append(Spacer(1, 0.05*cm))
    
    degree = extracted_info.get('degree', 'B.Tech')
    
    # Degree, branch, batch, year line - removed current year display
    story.append(Paragraph(
        f"<b>{degree} ({expanded_branch}-{year_suffix}yr), Batch - {joining_year}</b>", 
        header_style
    ))
    
    # Exam heading
    title_style = styles['Normal'].clone('TitleStyle')
    title_style.alignment = 1
    title_style.textColor = colors.darkgreen
    story.append(Paragraph(f"<b>{attendance_exam_heading}</b>", title_style))
    story.append(Spacer(1, 0.15*cm))

    info_style = styles['Normal'].clone('InfoStyle')
    info_data = [
        [Paragraph(f"<b>Course Name :- {metadata.get('course_name', 'N/A')}</b>", info_style), 
         Paragraph(f"<b>Course Code :- {metadata.get('course_code', 'N/A')}</b>", info_style)],
        [Paragraph(f"<b>Date :- {metadata.get('date', '')}</b>", info_style), 
         Paragraph(f"<b>Time :- {metadata.get('time', '')}</b>", info_style)]
    ]
    info_table = Table(info_data, colWidths=[10*cm, 8.5*cm])
    info_table.setStyle(TableStyle([
        ('LEFTPADDING', (0,0), (-1,-1), 0),
        ('TOPPADDING', (0,0), (-1,-1), 1),
        ('BOTTOMPADDING', (0,0), (-1,-1), 1),
        ('FONTNAME', (0,0), (-1,-1), 'Times-Roman')
    ]))
    story.append(info_table)
    story.append(Spacer(1, 0.15*cm))

    table_headers = ["S. No.", "Name of the Student", "Enrolment No.", "Set A/ Set B", "Answer Booklet No.", "Signature"]
    data = [table_headers]

    # Defensive: Ensure students are sorted by roll number
    student_list = sorted(student_list, key=lambda s: s.get('roll_number', ''))

    debarred_row_indices = []  # 1-based table row indices (header = row 0)

    for i, student in enumerate(student_list):
        # Truncate long names to prevent column overflow
        student_name = student.get('student_name', '')
        max_name_length = 22
        if len(student_name) > max_name_length:
            student_name = student_name[:max_name_length] + "..."

        is_debarred = student.get('is_debarred', False)
        table_row_idx = i + 1  # +1 because row 0 is the header

        ans_booklet_cell = "DU                           "
        sig_cell = ""

        if is_debarred:
            ans_style = styles['Normal'].clone(f'AnsCell_{i}')
            ans_style.alignment = 1  # Center alignment
            ans_booklet_cell = Paragraph('DU&nbsp;&nbsp;&nbsp;<font color="red">DEBARRED</font>&nbsp;&nbsp;', ans_style)
            debarred_row_indices.append(table_row_idx)

        data.append([
            str(i + 1),
            student_name,
            student.get('roll_number', ''),
            student.get('paper_set', ''),
            ans_booklet_cell,
            sig_cell
        ])

    col_widths = [1.3*cm, 5.5*cm, 3.6*cm, 2.4*cm, 3.6*cm, 3.1*cm]
    total_table_width = sum(col_widths)

    # Build base table style
    table_style_cmds = [
        ('GRID',          (0, 0), (-1, -1), 1, colors.black),
        ('ALIGN',         (0, 0), (-1, -1), 'CENTER'),
        ('VALIGN',        (0, 0), (-1, -1), 'MIDDLE'),
        ('FONTSIZE',      (0, 0), (-1, -1), 10),
        ('FONTNAME',      (0, 0), (-1, -1), 'Times-Roman'),
        ('FONTNAME',      (0, 0), (-1,  0), 'Times-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1,  0), 3),
        ('TOPPADDING',    (0, 0), (-1,  0), 3),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 2),
        ('TOPPADDING',    (0, 1), (-1, -1), 2),
        ('ALIGN',         (1, 1), (1,  -1), 'LEFT'),
    ]
    # Highlight every debarred row with a light red background
    for dr in debarred_row_indices:
        table_style_cmds.append(('BACKGROUND', (0, dr), (-1, dr), colors.HexColor('#FFE4E4')))

    attendance_table = Table(data, colWidths=col_widths, repeatRows=1)
    attendance_table.setStyle(TableStyle(table_style_cmds))
    story.append(attendance_table)

    summary_data = [
        [Paragraph(f"<b>No. of Students Registered = {len(student_list)}</b>", info_style)],
        [Paragraph("<b>No. of Students Appeared =</b>", info_style)],
        [Paragraph("<b>No. of Students Absent =</b>", info_style)],
        [Paragraph("<b>No. of Students Detained =</b>", info_style)],
        [Paragraph("<b>No. of Supplementary Copy =</b>", info_style)]
    ]
    summary_table = Table(summary_data, colWidths=[total_table_width])
    summary_table.setStyle(TableStyle([
        ('GRID', (0, 0), (-1, -1), 0.8, colors.black),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
        ('LEFTPADDING', (0, 0), (-1, -1), 4),
        ('TOPPADDING', (0, 0), (-1, -1), 3),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 3),
        ('FONTNAME', (0,0), (-1,-1), 'Times-Roman')
    ]))
    story.append(summary_table)
    story.append(Spacer(1, 1.7 * cm))
    
    sig_style = styles['Normal'].clone('SigStyle')
    sig_data = [[
        Paragraph("<b>1. Signature and Name of invigilator</b>", sig_style),
        Paragraph("<b>2. Signature and Name of invigilator</b>", sig_style)
    ]]
    sig_table = Table(sig_data, colWidths=[total_table_width/1.5, total_table_width/2 - 80])
    sig_table.setStyle(TableStyle([
        ('ALIGN', (0, 0), (0, 0), 'LEFT'),
        ('ALIGN', (1, 0), (1, 0), 'RIGHT'),
    ]))
    story.append(sig_table)

    # Build PDF with header/footer on all pages
    room_no = metadata.get('room_no', 'N/A')
    doc.build(story, 
              onFirstPage=lambda canvas, doc: header_and_footer(canvas, doc, room_no), 
              onLaterPages=lambda canvas, doc: header_and_footer(canvas, doc, room_no))

def process_and_generate_from_cache(plan_id, frontend_metadata=None):
    """
    CLEANED: Uses the structured 'batches' directly from CacheManager.
    No more regex parsing or manual batching loops here.
    """
    file_path = os.path.join(CACHE_DIR, f"{plan_id}.json")
    if not os.path.exists(file_path): return None

    with open(file_path, 'r') as f:
        json_data = json.load(f)

    # 1. Directly access pre-structured batches
    batches = json_data.get('batches', {})
    inputs = json_data.get('inputs', {})

    # 2. Setup metadata
    metadata = {
        "room_no": inputs.get('room_id', 'Manual'),
        "date": json_data.get('metadata', {}).get('last_updated', '').split('T')[0],
        "course_name": "", "course_code": "", "exam_title": "ATTENDANCE SHEET", "year": "2025"
    }
    if frontend_metadata: metadata.update(frontend_metadata)

    # 3. Print each batch using cached data
    output_files = []
    output_dir = "generated_report"
    os.makedirs(output_dir, exist_ok=True)

    for b_label, b_data in batches.items():
        students = b_data.get('students', [])
        extracted_info = b_data.get('info', {}) # Already parsed by CacheManager!
        
        if students:
            file_name = f"{output_dir}/attendance_{plan_id}_{b_label}.pdf"
            create_attendance_pdf(file_name, students, b_label, metadata, extracted_info)
            output_files.append(file_name)
    
    return output_files

if __name__ == '__main__':
    import sys
    process_and_generate_from_cache(sys.argv[1] if len(sys.argv) > 1 else "plan_test")