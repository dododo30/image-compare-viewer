# 使用教程.pptx 生成脚本：深色主题 16:9
# 用法：pip install python-pptx 后运行  python scripts/make_tutorial_ppt.py
# 输出：项目根目录 使用教程.pptx（功能更新后改内容再跑一次即可）
import os
from pptx import Presentation
from pptx.util import Inches, Pt, Emu
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn

BG = RGBColor(0x17, 0x17, 0x1A)
PANEL = RGBColor(0x26, 0x26, 0x2B)
WHITE = RGBColor(0xF5, 0xF5, 0xF5)
GRAY = RGBColor(0xA3, 0xA3, 0xAD)
SKY = RGBColor(0x38, 0xBD, 0xF8)
AMBER = RGBColor(0xFB, 0xBF, 0x24)
GREEN = RGBColor(0x34, 0xD3, 0x99)
PINK = RGBColor(0xF4, 0x72, 0xB6)
FONT = "Microsoft YaHei"

prs = Presentation()
prs.slide_width = Inches(13.333)
prs.slide_height = Inches(7.5)
BLANK = prs.slide_layouts[6]
SW, SH = prs.slide_width, prs.slide_height


def style_run(r, size, bold=False, color=WHITE):
    r.font.size = Pt(size)
    r.font.bold = bold
    r.font.color.rgb = color
    r.font.name = FONT
    rPr = r._r.get_or_add_rPr()
    ea = rPr.find(qn("a:ea"))
    if ea is None:
        ea = rPr.makeelement(qn("a:ea"), {})
        rPr.append(ea)
    ea.set("typeface", FONT)


def new_slide():
    s = prs.slides.add_slide(BLANK)
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = BG
    return s


def add_rect(s, x, y, w, h, color):
    sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, x, y, w, h)
    sh.fill.solid()
    sh.fill.fore_color.rgb = color
    sh.line.fill.background()
    sh.shadow.inherit = False
    return sh


def add_text(s, x, y, w, h, lines, align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP):
    """lines: list of (text, size, bold, color) 或 list[list[(text,size,bold,color)]] 段"""
    tb = s.shapes.add_textbox(x, y, w, h)
    tf = tb.text_frame
    tf.word_wrap = True
    tf.vertical_anchor = anchor
    first = True
    for line in lines:
        p = tf.paragraphs[0] if first else tf.add_paragraph()
        first = False
        p.alignment = align
        if isinstance(line, tuple):
            line = [line]
        for (text, size, bold, color) in line:
            r = p.add_run()
            r.text = text
            style_run(r, size, bold, color)
    return tb


def header(s, title, subtitle=None, accent=SKY):
    add_rect(s, Inches(0.55), Inches(0.5), Inches(0.12), Inches(0.62), accent)
    add_text(s, Inches(0.85), Inches(0.38), Inches(11.8), Inches(0.9),
             [(title, 30, True, WHITE)])
    if subtitle:
        add_text(s, Inches(0.87), Inches(1.12), Inches(11.8), Inches(0.4),
                 [(subtitle, 14, False, GRAY)])


def bullets(s, x, y, w, h, items, size=17):
    """items: list of (level, text, color) 或 (level, text)"""
    lines = []
    for it in items:
        lv, text = it[0], it[1]
        color = it[2] if len(it) > 2 else WHITE
        prefix = "▸ " if lv == 0 else "· "
        pad = "" if lv == 0 else "    "
        lines.append((pad + prefix + text, size if lv == 0 else size - 2, lv == 0, color))
    add_text(s, x, y, w, h, lines)


def add_table(s, x, y, w, h, rows, col_widths=None, size=13, header_size=13):
    shape = s.shapes.add_table(len(rows), len(rows[0]), x, y, w, h)
    tbl = shape.table
    if col_widths:
        total = sum(col_widths)
        for i, cw in enumerate(col_widths):
            tbl.columns[i].width = Emu(int(w * cw / total))
    for ri, row in enumerate(rows):
        for ci, cell_text in enumerate(row):
            cell = tbl.cell(ri, ci)
            cell.fill.solid()
            cell.fill.fore_color.rgb = PANEL if ri else RGBColor(0x0E, 0x74, 0x99)
            cell.margin_top = cell.margin_bottom = Pt(2)
            cell.margin_left = cell.margin_right = Pt(6)
            cell.vertical_anchor = MSO_ANCHOR.MIDDLE
            tf = cell.text_frame
            tf.word_wrap = True
            p = tf.paragraphs[0]
            r = p.add_run()
            r.text = str(cell_text)
            style_run(r, header_size if ri == 0 else size, ri == 0, WHITE)
    return tbl


def page_num(s, n):
    add_text(s, SW - Inches(0.9), SH - Inches(0.5), Inches(0.6), Inches(0.35),
             [(str(n), 11, False, GRAY)], align=PP_ALIGN.RIGHT)


# ============ S1 封面 ============
s = new_slide()
add_rect(s, 0, Inches(3.05), SW, Inches(0.06), SKY)
add_text(s, Inches(1), Inches(2.0), Inches(11.3), Inches(1.2),
         [("图片对比查看器", 54, True, WHITE)], align=PP_ALIGN.CENTER)
add_text(s, Inches(1), Inches(3.35), Inches(11.3), Inches(0.7),
         [("ISP / 相机 tuning 工程师一体化工具 · 使用教程", 22, False, SKY)], align=PP_ALIGN.CENTER)
add_text(s, Inches(1), Inches(4.3), Inches(11.3), Inches(0.5),
         [("图片对比  ·  RAW 调试  ·  色卡分析  ·  图像测量  ·  Gamma / CCM 转换", 16, False, GRAY)],
         align=PP_ALIGN.CENTER)
add_text(s, Inches(1), Inches(6.5), Inches(11.3), Inches(0.4),
         [("单文件便携版 · 免安装 · 2026-11", 13, False, GRAY)], align=PP_ALIGN.CENTER)

# ============ S2 功能总览 ============
s = new_slide()
header(s, "六大功能一页看懂", "左上角「🖼️ 图片对比查看器 ▾」菜单进入各功能页，「← 返回」回到查看器")
rows = [
    ["功能页", "面向场景", "核心能力"],
    ["🖼️ 图片查看器", "日常对比", "多图/覆盖对比、EXIF、框选统计、直方图"],
    ["🎯 色卡分析", "CCM 验证", "ColorChecker 24 色四点标定、ΔE、白平衡增益"],
    ["📊 图像分析", "客观测量", "差异热力图、shading、过曝裁切、噪声/SNR"],
    ["🔬 RAW 实验室", "底层调试", "RAW/YUV 裸数据 + ISP 参数链实时预览"],
    ["📈 Gamma 转换", "平台互转", "MTK ↔ QCOM，曲线可视化 + HDR 参考"],
    ["🎨 CCM 转换", "寄存器数据", "Hex ↔ Dec 互转、矩阵与颜色预览"],
]
add_table(s, Inches(0.7), Inches(1.75), Inches(11.9), Inches(4.9), rows, [2.4, 2.0, 6.5])
page_num(s, 2)

# ============ S3 安装运行 ============
s = new_slide()
header(s, "安装与运行", "只有一个 exe，双击即用")
bullets(s, Inches(0.8), Inches(1.8), Inches(6.0), Inches(4.5), [
    (0, "运行环境：64 位 Windows 10 / 11"),
    (0, "分发：只需 图片对比查看器 0.0.0.exe（约 96MB）"),
    (0, "无任何依赖，运行时全部内置"),
    (0, "所有数据本地处理，不上传网络"),
    (0, "可直接把图片/裸数据文件拖入窗口加载"),
], size=18)
add_rect(s, Inches(7.1), Inches(1.85), Inches(5.4), Inches(4.2), PANEL)
add_text(s, Inches(7.4), Inches(2.1), Inches(4.9), Inches(3.8), [
    ("⚠ 首次运行 SmartScreen 警告", 18, True, AMBER),
    ("", 8, False, GRAY),
    ("程序未购买代码签名证书，Windows 会弹蓝色警告——", 15, False, WHITE),
    ("这不是病毒。", 15, True, WHITE),
    ("", 8, False, GRAY),
    ("点「更多信息」→「仍要运行」即可，", 15, False, WHITE),
    ("仅此一次，之后双击直接打开。", 15, False, GRAY),
])
page_num(s, 3)

# ============ S4 查看器-操作 ============
s = new_slide()
header(s, "图片查看器 ①：加载与鼠标操作")
rows = [
    ["操作", "功能"],
    ["左键拖拽", "平移图片"],
    ["右键拖拽", "框选区域 → 右侧统计切换为「框选区域」"],
    ["右键单击（不拖）", "清除选区"],
    ["滚轮", "以光标为中心缩放（10% ~ 4000%）"],
    ["拖文件入窗口", "加载图片"],
]
add_table(s, Inches(0.8), Inches(1.8), Inches(6.4), Inches(3.6), rows, [2.2, 4.2], size=15)
bullets(s, Inches(7.6), Inches(1.9), Inches(5.2), Inches(4.4), [
    (0, "左侧图片列表", SKY),
    (1, "所有已导入图片，点击切换"),
    (1, "当前激活图始终占网格第一格"),
    (0, "布局 1 / 2 / 4 / 6", SKY),
    (1, "激活图 + 导入顺序填满其余格"),
    (0, "快捷键", SKY),
    (1, "框选、缩放、平移与图片查看器一致"),
], size=17)
page_num(s, 4)

# ============ S5 查看器-覆盖对比 ============
s = new_slide()
header(s, "图片查看器 ②：覆盖对比与统计")
bullets(s, Inches(0.8), Inches(1.8), Inches(5.8), Inches(4.6), [
    (0, "覆盖对比（B 图叠加到 A 图位置）", SKY),
    (1, "下拉框选 A / B，分割线左右划擦"),
    (1, "B 不透明度滑块 0~100% 混合"),
    (1, "缩放/拖动同步作用于叠加图"),
    (0, "右侧信息栏", SKY),
    (1, "EXIF：曝光/ISO/光圈/镜头等"),
    (1, "图像统计：直方图、均值、σ、Lab/HSV/HSL"),
    (1, "RAW 图额外显示 R/Gr/Gb/B 通道直方图"),
], size=17)
add_rect(s, Inches(7.0), Inches(1.85), Inches(5.5), Inches(4.5), PANEL)
add_text(s, Inches(7.3), Inches(2.1), Inches(5.0), Inches(4.0), [
    ("典型用法", 18, True, SKY),
    ("", 8, False, GRAY),
    ("① 同场景拍 tuning 前后两张", 15, False, WHITE),
    ("② 布局 2 左右并排看整体", 15, False, WHITE),
    ("③ 覆盖对比 + 拖分割线看局部", 15, False, WHITE),
    ("④ 右键框选关键区域比统计", 15, False, WHITE),
    ("", 8, False, GRAY),
    ("ΔE 级精度对比请用「📊 图像分析」", 14, False, AMBER),
])
page_num(s, 5)

# ============ S6 RAW 实验室-导入 ============
s = new_slide()
header(s, "RAW 实验室 ①：导入裸数据", "对话框选择，或直接把文件拖进页面")
rows = [
    ["类别", "支持格式"],
    ["Bayer RAW", "MIPI RAW10 / 12 / 14（packed）；16 位 unpacked（有效位深 10/12/14，低/高位对齐）"],
    ["YUV", "NV12 / NV21 / I420 / YV12 / UYVY / YUYV（支持 stride）"],
    ["Bayer 排列", "RGGB / BGGR / GRBG / GBRG"],
]
add_table(s, Inches(0.8), Inches(1.8), Inches(11.7), Inches(2.6), rows, [2.0, 9.7], size=14)
bullets(s, Inches(0.8), Inches(4.7), Inches(11.6), Inches(2.2), [
    (0, "必填宽高（偶数）；文件大小与预期帧自动比对，不足报错、偏大警告截取"),
    (0, "格式参数自动记忆——重开程序仍在，拖放导入直接沿用上次的设定"),
    (0, "导入后图像与照片同等待遇：缩放/拖动/框选统计/直方图全部可用"),
], size=16)
page_num(s, 6)

# ============ S7 RAW 实验室-ISP 参数 ============
s = new_slide()
header(s, "RAW 实验室 ②：ISP 参数链实时预览", "调节后 180ms 防抖刷新，全分辨率处理")
rows = [
    ["参数", "范围", "作用"],
    ["显示 Gamma", "0.5 ~ 3.5", "1.0=线性看原始数据；快捷 线性/2.2/2.4"],
    ["总增益", "0.1× ~ 16×", "数字增益，滑块右侧可直接键入"],
    ["R/G/B 通道增益", "0.1 ~ 4", "模拟 AWB 增益"],
    ["Shading 校正", "0 ~ 80%", "径向增益补偿镜头阴影"],
    ["CCM", "3×3 小数", "色彩校正矩阵，一键重置单位阵"],
]
add_table(s, Inches(0.8), Inches(1.8), Inches(11.7), Inches(3.4), rows, [2.6, 2.0, 7.0], size=14)
add_text(s, Inches(0.8), Inches(5.5), Inches(11.7), Inches(1.2), [
    ("处理链：增益（总+通道）→ shading → CCM → gamma；直方图反映增益后、CCM/gamma 前的线性数据", 15, False, GRAY),
    ("典型流程：线性 gamma 看原始 → 调 R/B 增益对齐直方图三通道 → 切 2.2 gamma 看效果 → 套 CCM", 15, False, SKY),
])
page_num(s, 7)

# ============ S8 色卡-操作 ============
s = new_slide()
header(s, "色卡分析 ①：四步出结果", "ColorChecker Classic 24 色")
steps = [
    ("①  拍摄", "正对色卡、光照均匀、无反光，占画面一定比例", SKY),
    ("②  加载", "打开图片或拖入页面", GREEN),
    ("③  标定", "点「开始标定」→ 按 左上→右上→右下→左下 点击色卡外沿四角（支持轻微透视）", AMBER),
    ("④  读数", "第四角点完自动出结果，画面叠加 4×6 网格编号供核对", PINK),
]
y = 1.9
for t, d, c in steps:
    add_rect(s, Inches(0.8), Inches(y), Inches(0.09), Inches(0.95), c)
    add_text(s, Inches(1.1), Inches(y - 0.04), Inches(2.2), Inches(0.6), [(t, 22, True, c)])
    add_text(s, Inches(3.2), Inches(y + 0.06), Inches(9.3), Inches(0.9), [(d, 16, False, WHITE)])
    y += 1.25
page_num(s, 8)

# ============ S9 色卡-结果 ============
s = new_slide()
header(s, "色卡分析 ②：结果解读")
rows = [
    ["指标", "含义", "判读"],
    ["平均/最大 ΔE", "与 X-Rite 参考值的色差", "<3 绿 优秀 / <6 黄 可接受"],
    ["WB 增益 R/G·B/G", "白块+中性灰估计的增益", "直接对照 AWB 日志"],
    ["中性灰曝光比", "测量/参考亮度", "100% = 曝光准确"],
]
add_table(s, Inches(0.8), Inches(1.8), Inches(11.7), Inches(2.6), rows, [3.0, 4.4, 4.3], size=14)
bullets(s, Inches(0.8), Inches(4.8), Inches(11.6), Inches(2.0), [
    (0, "a*b* 散点图：点=测量、圈=参考，偏移方向即偏色方向，连线长度=误差大小"),
    (0, "逐格表：24 格测量 RGB 与 ΔE，快速定位问题色（肤色/蓝/绿常见超标）"),
    (0, "口径提醒：相机 RGB 未做光谱适配，绝对 ΔE 偏大——用法是不同 CCM 版本间比相对优劣", AMBER),
], size=16)
page_num(s, 9)

# ============ S10 图像分析-差异+shading ============
s = new_slide()
header(s, "图像分析 ①：差异对比 · Shading 测量")
add_rect(s, Inches(0.8), Inches(1.8), Inches(5.75), Inches(4.7), PANEL)
add_text(s, Inches(1.05), Inches(2.0), Inches(5.3), Inches(0.5), [("① 差异对比", 20, True, PINK)])
bullets(s, Inches(1.05), Inches(2.6), Inches(5.3), Inches(3.7), [
    (1, "选 A/B 图 → 生成 |A−B| ×1~16 热力图"),
    (1, "统计 mean|Δ|、meanΔ、最大差、平均 ΔE"),
    (1, "右键框选后生成 → 区域限定统计"),
    (1, "调参前后「差多少」量化对比"),
], size=15)
add_rect(s, Inches(6.85), Inches(1.8), Inches(5.65), Inches(4.7), PANEL)
add_text(s, Inches(7.1), Inches(2.0), Inches(5.2), Inches(0.5), [("② Shading 测量", 20, True, SKY)])
bullets(s, Inches(7.1), Inches(2.6), Inches(5.2), Inches(3.7), [
    (1, "均匀灰场图一键分五区（中心+四角）"),
    (1, "每区 Y 均值、R/G、B/G 比值"),
    (1, "角/中心亮度比范围 + 不均匀 %"),
    (1, "LSC 调参与色彩 shading 评估"),
], size=15)
page_num(s, 10)

# ============ S11 图像分析-裁切+噪声 ============
s = new_slide()
header(s, "图像分析 ②：过曝裁切 · 噪声/SNR")
add_rect(s, Inches(0.8), Inches(1.8), Inches(5.75), Inches(4.7), PANEL)
add_text(s, Inches(1.05), Inches(2.0), Inches(5.3), Inches(0.5), [("③ 过曝/饱和裁切", 20, True, AMBER)])
bullets(s, Inches(1.05), Inches(2.6), Inches(5.3), Inches(3.7), [
    (1, "阈值 240~255 可调"),
    (1, "分通道统计裁切像素数与百分比"),
    (1, "蒙版视图：黑底按通道颜色高亮裁切点"),
    (1, "查 HDR 合成缝隙、gamma 拐点裁切"),
], size=15)
add_rect(s, Inches(6.85), Inches(1.8), Inches(5.65), Inches(4.7), PANEL)
add_text(s, Inches(7.1), Inches(2.0), Inches(5.2), Inches(0.5), [("④ 噪声 / SNR", 20, True, GREEN)])
bullets(s, Inches(7.1), Inches(2.6), Inches(5.2), Inches(3.7), [
    (1, "右键框选平坦区域（避开边缘纹理）"),
    (1, "3×3 high-pass 去场景后估 σ"),
    (1, "分通道 σ / SNR(dB) / 亮度 SNR"),
    (1, "选对比图同坐标测 → 自动 ΔSNR"),
], size=15)
page_num(s, 11)

# ============ S12 Gamma 基本 ============
s = new_slide()
header(s, "Gamma 转换 ①：MTK ↔ QCOM 互转", "与 Python 原版输出逐位一致（PCHIP 复刻 scipy 浮点顺序）")
bullets(s, Inches(0.8), Inches(1.8), Inches(5.9), Inches(4.6), [
    (0, "方向", SKY),
    (1, "MTK → QCOM：输入 256 组"),
    (1, "QCOM → MTK：输入 257 组"),
    (0, "输入", SKY),
    (1, "十进制：空格/逗号/换行分隔"),
    (1, "MTK 方向可勾选十六进制（粘 dump）"),
    (0, "输出", SKY),
    (1, "一键复制；组数不符红字提示"),
], size=16)
add_rect(s, Inches(7.0), Inches(1.85), Inches(5.5), Inches(4.5), PANEL)
add_text(s, Inches(7.3), Inches(2.1), Inches(5.0), Inches(4.0), [
    ("可信度", 18, True, SKY),
    ("", 8, False, GRAY),
    ("· MTK→QCOM 为整数运算，天然一致", 15, False, WHITE),
    ("· QCOM→MTK 的 PCHIP 逐位复刻", 15, False, WHITE),
    ("  scipy 的求值/舍入顺序", 15, False, WHITE),
    ("· 12 组边界用例 + 100 条随机曲线", 15, False, WHITE),
    ("  共 25,600 点 对拍零差异", 15, False, WHITE),
    ("", 8, False, GRAY),
    ("可放心替代命令行 Python 工具", 15, True, GREEN),
])
page_num(s, 12)

# ============ S13 Gamma 对比 ============
s = new_slide()
header(s, "Gamma 转换 ②：四层曲线对比", "同一坐标系叠加，HDR/SDR 形态一目了然")
rows = [
    ["层", "内容", "形态"],
    ["转换曲线", "输入（蓝）/ 输出（粉）", "粗实线"],
    ["标准 γ 对比", "输入 γ 值（最多 12 条）", "彩色虚线"],
    ["对比数据", "粘贴 gamma 表 256/257 组（最多 6 条）", "彩色实线"],
    ["HDR 参考", "+ PQ (ST 2084) / + HLG 一键添加", "彩色实线"],
]
add_table(s, Inches(0.8), Inches(1.8), Inches(11.7), Inches(2.9), rows, [2.2, 6.3, 3.2], size=14)
bullets(s, Inches(0.8), Inches(5.0), Inches(11.6), Inches(1.8), [
    (0, "PQ 按 10000 nits 归一化：暗部极缓（一半码值压在 0~100 nit）——HDR10/10+/杜比视界共用"),
    (0, "HLG：暗部=gamma 0.5，1/12 处平滑切入对数段——iPhone 杜比视界（Profile 8.4）所用"),
], size=15)
page_num(s, 13)

# ============ S14 CCM ============
s = new_slide()
header(s, "CCM 转换：Hex ↔ Dec", "MTK ISP6s / ISP4s 色彩校正矩阵，与原单文件工具结果一致")
bullets(s, Inches(0.8), Inches(1.8), Inches(5.9), Inches(4.6), [
    (0, "Hex → Dec", SKY),
    (1, "粘 6 个 32 位十六进制值 → 3×3 矩阵"),
    (1, "逐格显示 hex→dec；C++/纯十进制双输出"),
    (0, "Dec → Hex", SKY),
    (1, "9 个十进制值反向打包"),
    (1, "越限 [-4096,4095] 自动截断并警告"),
    (0, "支持批量多光源矩阵", SKY),
], size=16)
add_rect(s, Inches(7.0), Inches(1.85), Inches(5.5), Inches(4.5), PANEL)
add_text(s, Inches(7.3), Inches(2.1), Inches(5.0), Inches(4.0), [
    ("编码规则", 18, True, SKY),
    ("", 8, False, GRAY),
    ("· 每 32 位值：低 16 位=第 1 元素", 15, False, WHITE),
    ("  高 16 位=第 2 元素", 15, False, WHITE),
    ("· 13 位有符号：值 ≥ 4096 减 8192", 15, False, WHITE),
    ("", 8, False, GRAY),
    ("颜色预览：9 个样本色经 CCM 前后", 15, False, WHITE),
    ("色块对照，直观评估矩阵效果", 15, False, WHITE),
])
page_num(s, 14)

# ============ S15 常见问题 ============
s = new_slide()
header(s, "常见问题")
rows = [
    ["问题", "处理"],
    ["SmartScreen 蓝色警告", "更多信息 → 仍要运行（仅此一次，非病毒）"],
    ["朋友打不开", "确认 64 位 Win10/11；Mac/Linux 不支持此 exe"],
    ["RAW 导入全黑/花屏", "核对宽高、Bayer 排列、16 位对齐方式；先用小 dump 试"],
    ["重新打包提示文件占用", "关闭运行中的程序再打包"],
    ["ΔE 整体偏大", "相机 RGB 未做光谱适配，看相对趋势而非绝对值"],
]
add_table(s, Inches(0.8), Inches(1.8), Inches(11.7), Inches(4.2), rows, [3.4, 8.3], size=14)
page_num(s, 15)

# ============ S16 快捷键+结束 ============
s = new_slide()
header(s, "快捷键与结束语")
rows = [
    ["快捷键", "位置", "功能"],
    ["滚轮 / 左键拖 / 右键框选", "各图像区", "缩放 / 平移 / 区域统计"],
    ["Ctrl + Enter", "Gamma、CCM 页", "转换"],
    ["Ctrl + Enter", "Gamma 对比数据", "添加对比"],
]
add_table(s, Inches(0.8), Inches(1.8), Inches(11.7), Inches(2.4), rows, [3.4, 2.6, 5.7], size=14)
add_text(s, Inches(0.8), Inches(4.6), Inches(11.7), Inches(1.8), [
    ("数据说话：把「感觉变了」变成「ΔE 从 3.2 降到 1.8」", 22, True, SKY),
    ("", 10, False, GRAY),
    ("教程与程序同步更新于 GitHub：github.com/dododo30/image-compare-viewer", 15, False, GRAY),
])
page_num(s, 16)

# 输出到项目根目录（本脚本位于 scripts/ 下）
out = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "使用教程.pptx")
prs.save(out)
print("saved:", out, "slides:", len(prs.slides._sldIdLst))
