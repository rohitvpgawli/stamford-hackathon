from reportlab.pdfgen import canvas
from reportlab.lib.pagesizes import landscape, A4
from reportlab.lib.colors import HexColor, Color, white
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.utils import ImageReader
from PIL import Image
import os
import math


ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
OUT = os.path.join(ROOT, "output/pdf/Mango_Team_Product_and_Data_Guide.pdf")
ASSET_DIR = os.path.join(ROOT, "tmp/pdfs/assets")
HERO = os.path.join(ASSET_DIR, "mango-illustration-cover.png")
CLEANUP = os.path.join(ASSET_DIR, "mango-illustration-waterfront.png")

W, H = landscape(A4)
M = 44

INK = HexColor("#1C0F00")
GREEN = HexColor("#1C0F00")
GREEN_2 = HexColor("#E55200")
MANGO = HexColor("#FF6B1A")
MANGO_DARK = HexColor("#CC4400")
MANGO_SOFT = HexColor("#FFF0E6")
CREAM = HexColor("#FFF8F0")
PARCHMENT = HexColor("#FFF0DC")
PAPER = HexColor("#FFFFFF")
MUTED = HexColor("#8C6E50")
LINE = HexColor("#F0E0C8")
MINT = HexColor("#F2FAE0")
CLAY = HexColor("#FF3D5A")
LILAC = HexColor("#8BC400")
SKY = HexColor("#00AAFF")
CITRUS = HexColor("#FFD600")


pdfmetrics.registerFont(TTFont("Arial", "/System/Library/Fonts/Supplemental/Arial.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Bold", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"))
pdfmetrics.registerFont(TTFont("Arial-Italic", "/System/Library/Fonts/Supplemental/Arial Italic.ttf"))
pdfmetrics.registerFont(TTFont("Georgia", "/System/Library/Fonts/Supplemental/Georgia.ttf"))
pdfmetrics.registerFont(TTFont("Georgia-Bold", "/System/Library/Fonts/Supplemental/Georgia Bold.ttf"))


def set_alpha(c, fill=None, stroke=None):
    if fill is not None:
        try:
            c.setFillAlpha(fill)
        except Exception:
            pass
    if stroke is not None:
        try:
            c.setStrokeAlpha(stroke)
        except Exception:
            pass


def reset_alpha(c):
    set_alpha(c, fill=1, stroke=1)


def rr(c, x, y, w, h, r=16, fill=PAPER, stroke=None, sw=1):
    c.setLineWidth(sw)
    c.setFillColor(fill)
    if stroke:
        c.setStrokeColor(stroke)
        c.roundRect(x, y, w, h, r, fill=1, stroke=1)
    else:
        c.roundRect(x, y, w, h, r, fill=1, stroke=0)


def shadow_card(c, x, y, w, h, r=16, fill=PAPER, stroke=LINE):
    set_alpha(c, fill=.06)
    c.setFillColor(INK)
    c.roundRect(x+1, y-3, w, h, r, fill=1, stroke=0)
    reset_alpha(c)
    rr(c, x, y, w, h, r, fill, stroke)


def image_cover(c, path, x, y, w, h):
    im = Image.open(path)
    iw, ih = im.size
    scale = max(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    dx, dy = x + (w - dw) / 2, y + (h - dh) / 2
    c.saveState()
    p = c.beginPath()
    p.rect(x, y, w, h)
    c.clipPath(p, stroke=0, fill=0)
    c.drawImage(ImageReader(im), dx, dy, dw, dh, preserveAspectRatio=False, mask='auto')
    c.restoreState()


def measure(text, font, size):
    return pdfmetrics.stringWidth(text, font, size)


def wrap(text, font, size, max_width):
    words = text.split()
    if not words:
        return []
    lines, current = [], words[0]
    for word in words[1:]:
        trial = current + " " + word
        if measure(trial, font, size) <= max_width:
            current = trial
        else:
            lines.append(current)
            current = word
    lines.append(current)
    return lines


def draw_text(c, text, x, y, max_width, font="Arial", size=11, color=INK,
              leading=None, max_lines=None, align="left"):
    leading = leading or size * 1.35
    lines = []
    for paragraph in text.split("\n"):
        if paragraph == "":
            lines.append("")
        else:
            lines.extend(wrap(paragraph, font, size, max_width))
    if max_lines and len(lines) > max_lines:
        lines = lines[:max_lines]
        last = lines[-1]
        while last and measure(last + "...", font, size) > max_width:
            last = last[:-1]
        lines[-1] = last.rstrip() + "..."
    c.setFont(font, size)
    c.setFillColor(color)
    yy = y
    for line in lines:
        if align == "center":
            c.drawCentredString(x + max_width/2, yy, line)
        elif align == "right":
            c.drawRightString(x + max_width, yy, line)
        else:
            c.drawString(x, yy, line)
        yy -= leading
    return yy


def bullet_list(c, items, x, y, max_width, size=10, gap=8, color=INK, bullet=MANGO):
    yy = y
    for item in items:
        lines = wrap(item, "Arial", size, max_width - 18)
        c.setFillColor(bullet)
        c.circle(x+4, yy+3, 3, fill=1, stroke=0)
        c.setFillColor(color)
        c.setFont("Arial", size)
        for i, line in enumerate(lines):
            c.drawString(x+16, yy - i*size*1.35, line)
        yy -= len(lines)*size*1.35 + gap
    return yy


def pill(c, text, x, y, fill=MANGO_SOFT, color=MANGO_DARK, size=8, pad_x=9, h=20):
    w = measure(text, "Arial-Bold", size) + 2*pad_x
    rr(c, x, y, w, h, h/2, fill)
    c.setFillColor(color)
    c.setFont("Arial-Bold", size)
    c.drawCentredString(x+w/2, y+(h-size)/2+1, text)
    return w


def mango_mark(c, x, y, size=28, on_dark=False):
    c.saveState()
    c.setFillColor(MANGO if on_dark else INK)
    c.roundRect(x, y, size, size, size*.30, fill=1, stroke=0)
    c.setFillColor(INK if on_dark else CITRUS)
    c.setFont("Georgia-Bold", size*.47)
    c.drawCentredString(x+size/2, y+size*.30, "m")
    c.restoreState()


def logo(c, x=M, y=H-52, on_dark=False):
    base = PAPER if on_dark else INK
    c.setFont("Georgia", 19)
    c.setFillColor(base)
    c.drawString(x, y, "mang")
    ox = x + measure("mang", "Georgia", 19)
    c.setFillColor(MANGO)
    c.drawString(ox, y, "o")


def page_header(c, page_num, section=None, dark=False):
    logo(c, on_dark=dark)
    if section:
        c.setFont("Arial-Bold", 8)
        c.setFillColor(MANGO if dark else MANGO_DARK)
        c.drawRightString(W-M, H-50, section.upper())


def footer(c, page_num, dark=False):
    c.setStrokeColor(Color(1,1,1,.25) if dark else LINE)
    c.setLineWidth(.6)
    c.line(M, 28, W-M, 28)
    c.setFont("Arial", 7.5)
    c.setFillColor(Color(1,1,1,.65) if dark else MUTED)
    c.drawString(M, 16, "Mango team guide - Hackathon edition")
    c.drawRightString(W-M, 16, f"{page_num:02d} / 12")


def kicker(c, text, x, y, dark=False):
    c.setFont("Arial-Bold", 8)
    c.setFillColor(MANGO if dark else MANGO_DARK)
    c.drawString(x, y, text.upper())


def title(c, text, x, y, max_width, size=35, dark=False, max_lines=3):
    return draw_text(c, text, x, y, max_width, "Georgia", size,
                     PAPER if dark else INK, size*1.05, max_lines)


def small_icon(c, x, y, label, fill=MANGO_SOFT, color=INK, size=34):
    rr(c, x, y, size, size, 11, fill)
    c.setFillColor(color)
    c.setFont("Arial-Bold", 9)
    c.drawCentredString(x+size/2, y+size/2-3, label)


def arrow(c, x1, y1, x2, y2, color=MANGO, width=2):
    c.setStrokeColor(color)
    c.setFillColor(color)
    c.setLineWidth(width)
    c.line(x1, y1, x2, y2)
    ang = math.atan2(y2-y1, x2-x1)
    d = 7
    p1 = (x2-d*math.cos(ang-.45), y2-d*math.sin(ang-.45))
    p2 = (x2-d*math.cos(ang+.45), y2-d*math.sin(ang+.45))
    p = c.beginPath()
    p.moveTo(x2,y2); p.lineTo(*p1); p.lineTo(*p2); p.close()
    c.drawPath(p, fill=1, stroke=0)


def page_bg(c, color=CREAM):
    c.setFillColor(color)
    c.rect(0,0,W,H,fill=1,stroke=0)


def add_metadata(c):
    c.setTitle("Mango - Product and Data Guide")
    c.setAuthor("Mango Team")
    c.setSubject("Stamford quality-of-life, civic engagement, and student-life platform")
    c.setKeywords("Mango, Stamford, civic engagement, UConn Stamford, events, market research, datasets")


def cover(c):
    page_bg(c, CREAM)
    im = Image.open(HERO)
    iw, ih = im.size
    art_h = W * ih / iw
    art_y = H - art_h
    c.drawImage(ImageReader(im), 0, art_y, W, art_h, preserveAspectRatio=False, mask='auto')
    c.setFillColor(MANGO)
    c.rect(0, art_y-5, W, 5, fill=1, stroke=0)
    pill(c, "TEAM PRODUCT + DATA GUIDE", M, 92, fill=MANGO, color=INK, size=8.5, h=23)
    draw_text(c, "Product + data guide", M, 64, 340, "Georgia", 25, INK, 29, 1)
    draw_text(c, "A simple guide to what Mango does - and the Stamford data needed to power it.",
              M, 38, 440, "Arial", 9.5, MUTED, 13, 2)
    c.setFillColor(INK)
    c.setFont("Arial-Bold", 8)
    c.drawRightString(W-M, 67, "STAMFORD, CONNECTICUT")
    c.setFont("Arial", 8)
    c.setFillColor(MUTED)
    c.drawRightString(W-M, 48, "Hackathon edition - August 2026")


def page_what(c):
    page_bg(c)
    page_header(c,2,"Product in one minute")
    kicker(c,"What Mango is",M,H-104)
    title(c,"Local life, made actionable.",M,H-132,430,36)
    draw_text(c,
              "Stamford already has events, recreation, volunteering, student activities, public programs, and great local places. The problem is that they live in different places - and people still do not know what fits them.",
              M,H-222,430,"Arial",12,MUTED,17,5)
    # Fragmented source chips
    chips = [("CITY",INK),("PARKS + REC",GREEN),("UCONN",LILAC),("NONPROFITS",CLAY),("EVENTS",SKY),("LOCAL PLACES",MANGO_DARK)]
    x=M; y=275
    for i,(lab,col) in enumerate(chips):
        w=pill(c,lab,x,y,fill=PAPER,color=col,size=8,h=24)
        x += w+8
        if i==2:
            x=M; y-=34
    arrow(c,293,245,390,245,GREEN,2.5)
    panel_x = 430
    panel_w = W-M-panel_x
    rr(c,panel_x,186,panel_w,125,24,INK)
    mango_mark(c,panel_x+20,248,35,on_dark=True)
    kicker(c,"Mango adds intelligence",panel_x+70,275,dark=True)
    draw_text(c,"One strong recommendation",panel_x+70,248,panel_w-90,"Georgia",21,PAPER,25,2)
    draw_text(c,"Matched to your time, location, budget, interests, social comfort, and access needs.",panel_x+70,204,panel_w-90,"Arial",9.2,PARCHMENT,13,3)
    # Not another calendar banner
    rr(c,M,82,W-2*M,70,18,MANGO_SOFT)
    small_icon(c,M+16,100,"!",MANGO,INK,38)
    kicker(c,"Important",M+69,126)
    draw_text(c,"Mango is not another event calendar. It is the layer that helps someone choose, join, and participate offline.",M+69,105,W-2*M-95,"Arial-Bold",11,INK,15,3)
    footer(c,2)


def page_users(c):
    page_bg(c,PAPER)
    page_header(c,3,"People + pillars")
    kicker(c,"Who Mango serves",M,H-104)
    title(c,"Three audiences. One local need.",M,H-132,520,36)
    cards=[
        ("01","Stamford residents","A better local social life, useful ways to spend free time, and stronger ties to the city.",GREEN),
        ("02","UConn Stamford students","Things to do between or after classes, people to meet, and reasons to explore beyond campus.",LILAC),
        ("03","New residents","A friendly way to learn the city, find recurring places, and build a local network.",CLAY),
    ]
    gap=24; cw=(W-2*M-2*gap)/3; y=238; h=166
    for i,(num,head,body,col) in enumerate(cards):
        x=M+i*(cw+gap)
        shadow_card(c,x,y,cw,h,20,PAPER,LINE)
        rr(c,x+16,y+h-50,44,30,10,col)
        c.setFont("Arial-Bold",9);c.setFillColor(PAPER);c.drawCentredString(x+38,y+h-40,num)
        draw_text(c,head,x+16,y+h-78,cw-32,"Georgia",18,INK,22,2)
        draw_text(c,body,x+16,y+h-130,cw-32,"Arial",9.5,MUTED,14,4)
    # Pillars band
    kicker(c,"The three product pillars",M,210)
    pillars=[("QUALITY OF LIFE","Use free time better."), ("CIVIC ENGAGEMENT","Turn information into participation."),("STUDENT LIFE","Make commuter life feel connected.")]
    for i,(a,b) in enumerate(pillars):
        x=M+i*(cw+gap)
        c.setFillColor(MANGO); c.circle(x+7,158,7,fill=1,stroke=0)
        c.setFillColor(INK);c.setFont("Arial-Bold",9);c.drawString(x+22,164,a)
        draw_text(c,b,x+22,143,cw-35,"Arial",10,MUTED,14,2)
    footer(c,3)


def page_happy(c):
    page_bg(c,INK)
    page_header(c,4,"Core experience",dark=True)
    kicker(c,"The one strong happy path",M,H-104,dark=True)
    title(c,"From free time to a real plan.",M,H-132,600,36,dark=True)
    steps=[
        ("1","TELL","A person shares time, mood, budget, location, and whether they want company."),
        ("2","SCAN","Mango searches Stamford events, places, civic programs, and student activities."),
        ("3","MATCH","The best-fit option is ranked against the person's needs and compatible people."),
        ("4","EXPLAIN","Mango says why the plan fits using known facts - no invented details."),
        ("5","JOIN","They join one plan and see their small group or personalized week."),
    ]
    sx=M; y=258; gap=10; sw=(W-2*M-4*gap)/5; sh=176
    for i,(num,lab,body) in enumerate(steps):
        x=sx+i*(sw+gap)
        rr(c,x,y,sw,sh,18,Color(1,1,1,.08),Color(1,1,1,.16))
        c.setFillColor(MANGO);c.circle(x+23,y+sh-25,14,fill=1,stroke=0)
        c.setFillColor(INK);c.setFont("Arial-Bold",10);c.drawCentredString(x+23,y+sh-29,num)
        c.setFillColor(PAPER);c.setFont("Arial-Bold",9);c.drawString(x+16,y+sh-58,lab)
        draw_text(c,body,x+16,y+sh-82,sw-32,"Arial",8.7,PARCHMENT,13,6)
        if i<4:
            arrow(c,x+sw+1,y+sh/2,x+sw+gap-2,y+sh/2,MANGO,1.5)
    rr(c,M,87,W-2*M,116,20,MANGO_SOFT)
    kicker(c,"Example request",M+19,174)
    draw_text(c,"I'm free Saturday afternoon, want to meet people, and would like to do something useful outdoors.",M+19,145,470,"Georgia",18,INK,24,3)
    pill(c,"ONE PLAN",W-M-162,154,fill=MANGO,color=INK,size=8,h=23)
    draw_text(c,"Not a list of 25 links.",W-M-210,126,170,"Arial-Bold",9,INK,13,2,align="right")
    footer(c,4,dark=True)


def bubble(c,x,y,w,text,kind="user",max_lines=6):
    bg = INK if kind=="user" else PAPER
    fg = PAPER if kind=="user" else INK
    rr(c,x,y,w,68 if max_lines<=3 else 88,18,bg,LINE if kind!="user" else None)
    draw_text(c,text,x+14,y+(49 if max_lines<=3 else 66),w-28,"Arial",9.5,fg,13,max_lines)


def page_conversation(c):
    page_bg(c)
    page_header(c,5,"Conversation example")
    kicker(c,"Text first",M,H-104)
    title(c,"The conversation is the onboarding.",M,H-132,360,34)
    draw_text(c,"Mango asks only what it needs. You get value before filling out a profile.",M,H-217,350,"Arial",11,MUTED,16,4)
    # Phone
    pw=300; px=W-M-pw; py=67; ph=470
    shadow_card(c,px,py,pw,ph,32,PAPER,LINE)
    rr(c,px+103,py+ph-17,94,6,3,INK)
    mango_mark(c,px+20,py+ph-60,28)
    c.setFillColor(INK);c.setFont("Arial-Bold",11);c.drawString(px+57,py+ph-44,"Mango")
    c.setFillColor(MUTED);c.setFont("Arial",7.5);c.drawString(px+57,py+ph-57,"Stamford's local friend")
    c.setStrokeColor(LINE);c.line(px+16,py+ph-73,px+pw-16,py+ph-73)
    bubble(c,px+54,py+ph-156,226,"I'm free Saturday afternoon. I want to get outside, meet people, and do something useful. Nothing expensive.","user",6)
    bubble(c,px+18,py+ph-262,246,"I'd pick Mill River Community Cleanup - Sat 1 PM, Downtown. It is free, outdoors, and four compatible people are interested.","mango",6)
    pill(c,"Reply JOIN",px+18,py+ph-298,fill=MANGO_SOFT,color=INK,size=8,h=22)
    bubble(c,px+188,py+ph-350,92,"JOIN","user",3)
    bubble(c,px+18,py+27,246,"You're in. I added the cleanup to your Mango plan and saved your group.","mango",3)
    # Left principles
    principles=[
        ("01","Ask with a reason","Only ask for information that improves the next recommendation."),
        ("02","Recommend one","A clear opinion beats a long directory."),
        ("03","Explain the fit","Time, place, price, access, interest, and social signals."),
        ("04","Make JOIN simple","The final action is deterministic and easy to confirm."),
    ]
    y=293
    for num,head,body in principles:
        small_icon(c,M,y-7,num,MANGO_SOFT,INK,35)
        c.setFillColor(INK);c.setFont("Arial-Bold",10);c.drawString(M+49,y+16,head)
        draw_text(c,body,M+49,y-1,315,"Arial",8.7,MUTED,12,3)
        y-=72
    footer(c,5)


def reco_card(c,x,y,w,h,theme,label,title_txt,meta,why,people,score):
    shadow_card(c,x,y,w,h,16,PAPER,LINE)
    c.setFillColor(theme);c.rect(x,y+h-7,w,7,fill=1,stroke=0)
    tint = MANGO_SOFT if theme == MANGO else (MINT if theme == LILAC else HexColor("#E6F6FF"))
    pill(c,label,x+14,y+h-42,fill=tint,color=INK,size=7,h=20)
    c.setFillColor(MANGO_DARK);c.setFont("Arial-Bold",8);c.drawRightString(x+w-14,y+h-30,score+" FIT")
    draw_text(c,title_txt,x+14,y+h-70,w-28,"Georgia",16.5,INK,19,2)
    c.setFillColor(MUTED);c.setFont("Arial-Bold",7.5);c.drawString(x+14,y+h-111,meta)
    c.setStrokeColor(LINE);c.line(x+14,y+h-126,x+w-14,y+h-126)
    kicker(c,"Why Mango picked it",x+14,y+h-146)
    draw_text(c,why,x+14,y+h-166,w-28,"Arial",8.5,MUTED,12,4)
    pill(c,people,x+14,y+20,fill=MINT,color=GREEN,size=7.5,h=22)
    cta_text = "JOIN PLAN"
    cta_w = measure(cta_text,"Arial-Bold",7.5)+18
    pill(c,cta_text,x+w-14-cta_w,y+20,fill=INK,color=CREAM,size=7.5,h=22)


def page_cards(c):
    page_bg(c,PAPER)
    page_header(c,6,"Recommendation examples")
    kicker(c,"What the product returns",M,H-104)
    title(c,"One card. A clear reason. A next step.",M,H-132,600,35)
    y=106; h=350; gap=24; w=(W-2*M-2*gap)/3
    reco_card(c,M,y,w,h,MANGO,"BEST CIVIC MATCH","Mill River Community Cleanup","SAT 1 PM - DOWNTOWN - FREE","Fits Saturday afternoon, outdoor preference, civic intent, and small-group comfort.","4 compatible people", "94%")
    reco_card(c,M+w+gap,y,w,h,LILAC,"STUDENT PICK","UConn Student Game Night","THU 5:30 PM - CAMPUS - FREE","Starts after class, costs nothing, and has a low-pressure social format nearby.","6 students interested", "91%")
    reco_card(c,M+2*(w+gap),y,w,h,SKY,"QUALITY-OF-LIFE PICK","Harbor Point Sunset Walk","FRI 6:15 PM - 1.2 MI - FREE","Matches a short evening window, outdoor interest, and a relaxed social pace.","3 nearby matches", "88%")
    draw_text(c,"Illustrative sample records for the hackathon prototype. Live details must always come from a verified source.",M,76,W-2*M,"Arial-Italic",8,MUTED,11,2)
    footer(c,6)


def page_civic(c):
    page_bg(c)
    image_cover(c,CLEANUP,420,0,W-420,H)
    c.setFillColor(CREAM);c.rect(0,0,455,H,fill=1,stroke=0)
    # soft photo blend edge
    c.setFillColor(CREAM)
    set_alpha(c,fill=.72)
    c.rect(420,0,50,H,fill=1,stroke=0)
    reset_alpha(c)
    page_header(c,7,"Civic engagement")
    kicker(c,"The civic promise",M,H-104)
    title(c,"Participation, not just information.",M,H-132,340,35)
    draw_text(c,"A city calendar can say what exists. Mango should help someone see why it matters to them and make joining feel easy.",M,H-228,340,"Arial",11,MUTED,16,5)
    rr(c,M,242,330,98,18,PAPER,LINE)
    c.setFillColor(MUTED);c.setFont("Arial-Bold",8);c.drawString(M+16,316,"BEFORE")
    draw_text(c,"Parks & Rec has an event Saturday.",M+16,292,298,"Georgia",15,INK,20,2)
    arrow(c,M+148,255,M+198,255,MANGO,2)
    rr(c,M,96,330,139,18,INK)
    c.setFillColor(MANGO);c.setFont("Arial-Bold",8);c.drawString(M+16,209,"WITH MANGO")
    draw_text(c,"This event fits your schedule and interests. Three residents and two UConn students are also interested. Join them?",M+16,184,298,"Georgia",12.8,PAPER,16,4)
    pill(c,"JOIN THE PLAN",M+16,108,fill=MANGO,color=INK,size=8,h=23)
    footer(c,7)


def dataset_source_card(c,x,y,w,h,code,head,examples,color):
    rr(c,x,y,w,h,16,PAPER,LINE)
    small_icon(c,x+14,y+h-48,code,color,PAPER,34)
    draw_text(c,head,x+59,y+h-27,w-73,"Arial-Bold",9.5,INK,13,2)
    draw_text(c,examples,x+14,y+h-71,w-28,"Arial",8.3,MUTED,11.5,5)


def page_data_universe(c):
    page_bg(c,PAPER)
    page_header(c,8,"Dataset blueprint")
    kicker(c,"What Mango must know",M,H-104)
    title(c,"A living map of Stamford opportunities.",M,H-132,610,35)
    draw_text(c,"Market research finds the sources. Data building turns each source into consistent, searchable records.",M,H-184,610,"Arial",10.5,MUTED,15,3)
    items=[
        ("CT","City + public","City calendar, public meetings, community initiatives, public services",GREEN),
        ("PR","Parks + Rec","Programs, sports, classes, park events, registration and capacity",GREEN_2),
        ("UC","UConn Stamford","Student organizations, campus events, workshops, academic breaks",LILAC),
        ("VO","Volunteer","Cleanups, food support, mentoring, nonprofit and neighborhood needs",CLAY),
        ("EV","Culture + events","Libraries, museums, arts, music, festivals, markets, talks",SKY),
        ("LP","Local places","Businesses, venues, cafes, parks, trails, recurring activities",MANGO_DARK),
    ]
    gap=24;w=(W-2*M-2*gap)/3;h=105
    for i,item in enumerate(items):
        row=i//3; col=i%3
        dataset_source_card(c,M+col*(w+gap),285-row*(h+22),w,h,*item)
    rr(c,M,72,W-2*M,64,17,MANGO_SOFT)
    kicker(c,"Research question",M+17,112)
    draw_text(c,"Can Mango answer: what is happening, when, where, what does it cost, who can attend, how accessible is it, and how trustworthy is the record?",M+17,91,W-2*M-34,"Arial-Bold",10.2,INK,14,3)
    footer(c,8)


def schema_block(c,x,y,w,h,head,fields,color):
    rr(c,x,y,w,h,18,PAPER,LINE)
    c.setFillColor(color);c.rect(x,y+h-8,w,8,fill=1,stroke=0)
    c.setFillColor(INK);c.setFont("Georgia",15);c.drawString(x+15,y+h-33,head)
    bullet_list(c,fields,x+15,y+h-57,w-30,8.2,4,MUTED,color)


def page_schema(c):
    page_bg(c)
    page_header(c,9,"Canonical record")
    kicker(c,"Fields every dataset needs",M,H-104)
    title(c,"Normalize first. Recommend second.",M,H-132,550,35)
    blocks=[
        ("Identity",["source_id + source_url","organizer + source organization","record type + category tags","last verified timestamp"],GREEN),
        ("What",["title + plain-language summary","interests + activity tags","civic / student / social signal","indoor / outdoor + effort level"],MANGO_DARK),
        ("When",["start + end date/time","timezone + recurrence","registration deadline","cancellation / sold-out status"],CLAY),
        ("Where",["venue + full address","neighborhood + latitude/longitude","distance / transit context","virtual or in-person"],SKY),
        ("Access",["price + free flag","age or eligibility rules","accessibility notes","registration, capacity, equipment"],LILAC),
        ("Trust",["source updated timestamp","collection method","confidence / completeness score","change history + owner"],GREEN_2),
    ]
    gap=24;bw=(W-2*M-2*gap)/3;bh=155;top=245
    for i,b in enumerate(blocks):
        row=i//3;col=i%3
        schema_block(c,M+col*(bw+gap),top-row*(bh+18),bw,bh,*b)
    footer(c,9)


def page_matching(c):
    page_bg(c,INK)
    page_header(c,10,"Matching + privacy",dark=True)
    kicker(c,"The intelligence layer",M,H-104,dark=True)
    title(c,"Fit is more than an interest tag.",M,H-132,580,35,dark=True)
    # inputs
    lx=M; y=235; boxw=205; boxh=205
    rr(c,lx,y,boxw,boxh,22,Color(1,1,1,.08),Color(1,1,1,.16))
    kicker(c,"Who you are",lx+17,y+boxh-27,dark=True)
    bullet_list(c,["availability + location","budget + travel mode","interests + activity style","student / resident context","group size + crowd comfort","accessibility needs"],lx+17,y+boxh-55,boxw-34,8.8,7,PARCHMENT,MANGO)
    rx=W-M-boxw
    rr(c,rx,y,boxw,boxh,22,Color(1,1,1,.08),Color(1,1,1,.16))
    kicker(c,"What is happening",rx+17,y+boxh-27,dark=True)
    bullet_list(c,["time + duration","place + distance","price + eligibility","indoor / outdoor + effort","social format + capacity","status + source trust"],rx+17,y+boxh-55,boxw-34,8.8,7,PARCHMENT,MANGO)
    # Center match engine
    cx=W/2-95
    rr(c,cx,y+24,190,158,30,MANGO)
    mango_mark(c,cx+68,y+124,52)
    c.setFillColor(INK);c.setFont("Arial-Bold",9);c.drawCentredString(W/2,y+97,"MANGO MATCH")
    draw_text(c,"What should you do - and who should you do it with?",cx+18,y+73,154,"Georgia",14.5,INK,18,3,align="center")
    arrow(c,lx+boxw+14,y+102,cx-12,y+102,MANGO,2)
    arrow(c,rx-14,y+102,cx+202,y+102,MANGO,2)
    rr(c,M,78,W-2*M,102,20,Color(1,1,1,.07),Color(1,1,1,.17))
    kicker(c,"Privacy rule",M+18,151,dark=True)
    draw_text(c,"Show aggregate social proof, not private profiles. Never reveal phone numbers, exact home addresses, surnames, or sensitive answers. Ask before using social matching.",M+18,127,W-2*M-36,"Arial-Bold",10.5,PAPER,15,4)
    footer(c,10,dark=True)


def workflow_step(c,x,y,w,num,head,body,color):
    rr(c,x,y,w,95,16,CREAM,LINE)
    c.setFillColor(color);c.circle(x+18,y+73,14,fill=1,stroke=0)
    c.setFillColor(PAPER if color!=MANGO else INK);c.setFont("Arial-Bold",8);c.drawCentredString(x+18,y+70,num)
    c.setFillColor(INK);c.setFont("Arial-Bold",9.5);c.drawString(x+40,y+70,head)
    draw_text(c,body,x+12,y+49,w-24,"Arial",7.5,MUTED,10.5,4)


def page_playbook(c):
    page_bg(c,PAPER)
    page_header(c,11,"Research + data playbook")
    kicker(c,"How the team should work",M,H-104)
    title(c,"Build the smallest trustworthy dataset.",M,H-132,600,35)
    draw_text(c,"For the hackathon, depth and consistency across 50-100 useful records matters more than scraping everything.",M,H-184,610,"Arial",10.5,MUTED,15,3)
    # process timeline
    steps=[
        ("1","Map sources","List the calendars, organizations, owners, formats, and update frequency.",GREEN),
        ("2","Collect","Prefer official feeds, exports, APIs, or approved manual capture.",GREEN_2),
        ("3","Normalize","Convert each source to the shared Mango fields and tag vocabulary.",MANGO),
        ("4","Verify","Check date, location, cost, access, registration, and live status.",CLAY),
        ("5","Refresh","Track last verified time, changes, cancellations, and source failures.",SKY),
    ]
    process_gap=12
    process_w=(W-2*M-4*process_gap)/5
    x=M;y=305
    for i,s in enumerate(steps):
        step_x=x+i*(process_w+process_gap)
        workflow_step(c,step_x,y,process_w,*s)
        if i<4:
            arrow(c,step_x+process_w+1,y+48,step_x+process_w+process_gap-2,y+48,MANGO,1.2)
    # two panels
    panel_gap=24
    panel_w=(W-2*M-panel_gap)/2
    rr(c,M,82,panel_w,212,20,MINT)
    kicker(c,"Market researcher checklist",M+18,286)
    bullet_list(c,[
        "Who owns the source and how often does it change?",
        "Which fields are present, missing, ambiguous, or stale?",
        "Is registration required and does availability change?",
        "Is the opportunity realistic for students, residents, and new arrivals?",
        "Can the team collect and refresh it reliably and with permission?",
    ],M+18,260,panel_w-36,9,7,INK,GREEN)
    panel2_x=M+panel_w+panel_gap
    rr(c,panel2_x,82,panel_w,212,20,MANGO_SOFT)
    kicker(c,"Hackathon data priority",panel2_x+18,286)
    priorities=[("P0","Core facts","title, time, place, cost, status, source"),("P1","Fit fields","tags, outdoor, duration, distance, access"),("P2","Social fields","group format, capacity, interest counts"),("P3","Enrichment","images, reviews, weather, popularity")]
    yy=258
    for code,head,body in priorities:
        pill(c,code,panel2_x+18,yy-3,fill=MANGO,color=INK,size=7.5,h=21)
        c.setFillColor(INK);c.setFont("Arial-Bold",9);c.drawString(panel2_x+63,yy+5,head)
        draw_text(c,body,panel2_x+63,yy-10,panel_w-81,"Arial",8.2,MUTED,11,2)
        yy-=47
    footer(c,11)


def page_finish(c):
    page_bg(c)
    page_header(c,12,"MVP + success")
    kicker(c,"What we are building now",M,H-104)
    title(c,"One excellent offline outcome.",M,H-132,520,36)
    # MVP funnel
    rr(c,M,286,W-2*M,154,24,INK)
    labels=[("PREFERENCE","I have Saturday afternoon."),("SEARCH","Find verified local options."),("RECOMMEND","Pick one and explain why."),("MATCH","Show a small-group signal."),("JOIN","Move toward attendance.")]
    cell=(W-2*M)/5
    for i,(a,b) in enumerate(labels):
        x=M+i*cell
        if i>0:
            c.setStrokeColor(Color(1,1,1,.18));c.line(x,305,x,421)
        c.setFillColor(MANGO);c.setFont("Arial-Bold",7.5);c.drawString(x+14,408,a)
        draw_text(c,b,x+14,382,cell-28,"Georgia",13,PAPER,17,4)
    # scorecards
    kicker(c,"Success is not another click",M,246)
    metrics=[("PRIMARY","Did someone participate offline?",GREEN),("BEHAVIOR","Plans joined and attendance",MANGO_DARK),("COMMUNITY","Civic, student, and repeat participation",LILAC),("CONNECTION","New local relationships",CLAY)]
    gap=16;w=(W-2*M-3*gap)/4;y=134;h=88
    for i,(tag,body,col) in enumerate(metrics):
        x=M+i*(w+gap)
        rr(c,x,y,w,h,16,PAPER,LINE)
        c.setFillColor(col);c.rect(x,y+h-6,w,6,fill=1,stroke=0)
        c.setFillColor(col);c.setFont("Arial-Bold",7.5);c.drawString(x+13,y+h-25,tag)
        draw_text(c,body,x+13,y+h-44,w-26,"Arial-Bold",9.5,INK,13,3)
    rr(c,M,67,W-2*M,47,15,MANGO)
    c.setFillColor(INK);c.setFont("Arial-Bold",11);c.drawCentredString(W/2,84,"Research what exists. Structure what matters. Help Stamford show up.")
    footer(c,12)


def build():
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    c = canvas.Canvas(OUT, pagesize=(W,H), pageCompression=1)
    add_metadata(c)
    pages=[cover,page_what,page_users,page_happy,page_conversation,page_cards,page_civic,page_data_universe,page_schema,page_matching,page_playbook,page_finish]
    for fn in pages:
        fn(c)
        c.showPage()
    c.save()
    print(OUT)


if __name__ == "__main__":
    build()
