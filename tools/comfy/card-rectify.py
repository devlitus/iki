"""Detecta la carta sobre la mesa oscura, corrige la perspectiva y la deja a 832x1248 (entrada de Qwen Edit).

Uso: rectify.py <entrada> <salida.png> [debug.png]
"""
import sys

import cv2
import numpy as np

OUT_W, OUT_H = 832, 1248


def card_mask(img):
    hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
    s, v = hsv[..., 1].astype(int), hsv[..., 2].astype(int)
    bg = ((v < 115) & (s < 60)).astype(np.uint8)
    bg = cv2.morphologyEx(bg, cv2.MORPH_OPEN, np.ones((5, 5), np.uint8))
    # El fondo es lo oscuro conectado al borde de la imagen.
    h, w = bg.shape
    ff = np.zeros((h + 2, w + 2), np.uint8)
    seeded = bg.copy()
    for x, y in [(x, 0) for x in range(0, w, 4)] + [(x, h - 1) for x in range(0, w, 4)] + \
                [(0, y) for y in range(0, h, 4)] + [(w - 1, y) for y in range(0, h, 4)]:
        if seeded[y, x] == 1:
            cv2.floodFill(seeded, ff, (x, y), 2)
    card = (seeded != 2).astype(np.uint8) * 255
    card = cv2.morphologyEx(card, cv2.MORPH_CLOSE, np.ones((15, 15), np.uint8))
    return card


def line_intersect(l1, l2):
    (vx1, vy1, x1, y1), (vx2, vy2, x2, y2) = l1, l2
    a = np.array([[vx1, -vx2], [vy1, -vy2]])
    t = np.linalg.solve(a, np.array([x2 - x1, y2 - y1]))
    return np.array([x1 + t[0] * vx1, y1 + t[0] * vy1])


def find_quad(img):
    h, w = img.shape[:2]
    mask = card_mask(img)
    cnts, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
    c = max(cnts, key=cv2.contourArea)
    if cv2.contourArea(c) < 0.5 * w * h:
        return np.float32([[0, 0], [w, 0], [w, h], [0, h]])
    pts = c[:, 0, :].astype(np.float32)
    # Cada lado: puntos del contorno pegados a su borde aproximado (sin las esquinas redondeadas).
    x0, y0, bw, bh = cv2.boundingRect(c)
    m = 0.12
    sides = {
        'top': pts[(np.abs(pts[:, 1] - pts[:, 1].min()) < 0.05 * bh) & (pts[:, 0] > x0 + m * bw) & (pts[:, 0] < x0 + (1 - m) * bw)],
        'bottom': pts[(np.abs(pts[:, 1] - pts[:, 1].max()) < 0.05 * bh) & (pts[:, 0] > x0 + m * bw) & (pts[:, 0] < x0 + (1 - m) * bw)],
        'left': pts[(np.abs(pts[:, 0] - pts[:, 0].min()) < 0.05 * bw) & (pts[:, 1] > y0 + m * bh) & (pts[:, 1] < y0 + (1 - m) * bh)],
        'right': pts[(np.abs(pts[:, 0] - pts[:, 0].max()) < 0.05 * bw) & (pts[:, 1] > y0 + m * bh) & (pts[:, 1] < y0 + (1 - m) * bh)],
    }
    lines = {k: cv2.fitLine(v, cv2.DIST_HUBER, 0, 0.01, 0.01).ravel() for k, v in sides.items()}
    tl = line_intersect(lines['top'], lines['left'])
    tr = line_intersect(lines['top'], lines['right'])
    br = line_intersect(lines['bottom'], lines['right'])
    bl = line_intersect(lines['bottom'], lines['left'])
    return np.float32([tl, tr, br, bl])


def main():
    src, out = sys.argv[1], sys.argv[2]
    img = cv2.imread(src)
    quad = find_quad(img)
    # Margen de seguridad para no dejar mesa en los bordes.
    pad = 4
    pad = cv2.copyMakeBorder(img, pad, pad, pad, pad, cv2.BORDER_REPLICATE)
    quad_p = quad + 4
    inset = 3
    dst = np.float32([[-inset, -inset], [OUT_W + inset, -inset], [OUT_W + inset, OUT_H + inset], [-inset, OUT_H + inset]])
    m = cv2.getPerspectiveTransform(quad_p, dst)
    warped = cv2.warpPerspective(pad, m, (OUT_W, OUT_H), flags=cv2.INTER_LANCZOS4, borderMode=cv2.BORDER_REPLICATE)
    cv2.imwrite(out, warped)
    print(src, 'quad', np.round(quad).astype(int).tolist(), 'img', img.shape[1], img.shape[0])
    if len(sys.argv) > 3:
        dbg = img.copy()
        cv2.polylines(dbg, [np.int32(quad)], True, (0, 255, 0), 3)
        cv2.imwrite(sys.argv[3], dbg)


main()
