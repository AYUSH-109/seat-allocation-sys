from dataclasses import dataclass
from enum import Enum
from typing import Optional

class PaperSet(Enum):
    A = "A"
    B = "B"

@dataclass
class Seat:
    row: int
    col: int
    batch: Optional[int] = None
    paper_set: Optional[PaperSet] = None
    block: Optional[int] = None
    # roll_number may be an integer or a formatted string (e.g. BTCS24O1134 or enrollment)
    roll_number: Optional[str] = None
    # Name of the student 
    student_name: Optional[str] = None 
    # Semester attached by upload (e.g. "I", "II", etc.)
    semester: Optional[str] = None
    # is_broken: True if this seat is broken/unavailable
    is_broken: bool = False
    # color: color code for display (e.g., "#FF0000" for red, "#F3F4F6" for light gray)
    color: str = "#FFFFFF"
