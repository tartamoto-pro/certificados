/* Lector de la foto del calendario Shifter: encuentra la cuadrícula (6 semanas x 7 días)
   y mira el color de cada casilla. Morado = Di, turquesa = N, verde = M, blanco/gris = libre.
   Trabaja sobre {width, height, data} (RGBA), igual que un ImageData del navegador. */
(function (raiz) {
  function lum(d, i) { return 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]; }

  /* líneas horizontales finas y oscuras que cruzan buena parte del ancho */
  function lineasH(img, umbral) {
    var w = img.width, h = img.height, d = img.data, frac = new Float32Array(h);
    for (var y = 0; y < h; y++) {
      var n = 0, o = y * w * 4;
      for (var x = 0; x < w; x++) if (lum(d, o + x * 4) < umbral) n++;
      frac[y] = n / w;
    }
    return frac;
  }
  function tramos(frac, min, maxGrosor) {
    var out = [], y = 0, h = frac.length;
    while (y < h) {
      if (frac[y] >= min) {
        var a = y, best = 0; while (y < h && frac[y] >= min) { best = Math.max(best, frac[y]); y++; }
        if (y - a <= maxGrosor) out.push({ c: (a + y - 1) / 2, f: best });
      } else y++;
    }
    return out;
  }
  /* cuánto parece una línea fina en yc: oscuro justo ahí y claro un poco más arriba y más abajo
     (así no confunde la barra oscura de arriba de la app con el borde de la cuadrícula) */
  function cerca(frac, yc, r, s) {
    var m = 0, h = frac.length;
    for (var y = Math.round(yc - r); y <= Math.round(yc + r); y++) if (y >= 0 && y < h) m = Math.max(m, frac[y]);
    function lado(ks) { var t = 0, n = 0; ks.forEach(function (k) { var yy = Math.round(yc + k * s); if (yy >= 0 && yy < h) { t += frac[yy]; n++; } }); return n ? t / n : 1; }
    return m - Math.max(lado([-0.15, -0.1]), lado([0.1, 0.15]));
  }

  function buscarCuadricula(img) {
    var w = img.width, h = img.height, mejor = null;
    [90, 120, 60].some(function (umbral) {
      var frac = lineasH(img, umbral);
      var cand = tramos(frac, 0.45, Math.max(3, h * 0.012));
      /* cadena más larga de líneas a la misma distancia */
      for (var i = 0; i < cand.length; i++) for (var j = i + 1; j < cand.length; j++) {
        var s = cand[j].c - cand[i].c;
        if (s < h * 0.05 || s > h * 0.2) continue;
        var cadena = [cand[i].c, cand[j].c], ult = cand[j].c;
        for (var k = j + 1; k < cand.length; k++) {
          var dd = cand[k].c - ult;
          if (Math.abs(dd - s) <= s * 0.12) { cadena.push(cand[k].c); ult = cand[k].c; }
          else if (dd > s * 1.2) break;
        }
        if (cadena.length > 7) continue;
        if (!mejor || cadena.length > mejor.cad.length || (cadena.length === mejor.cad.length && s > mejor.s))
          mejor = { cad: cadena, s: (cadena[cadena.length - 1] - cadena[0]) / (cadena.length - 1), frac: frac, umbral: umbral };
      }
      return mejor && mejor.cad.length >= 4;
    });
    if (!mejor || mejor.cad.length < 4) return null;
    var s = mejor.s, falta = 7 - mejor.cad.length, top0 = mejor.cad[0], elegido = 0, puntos = -1;
    for (var t = 0; t <= falta; t++) {
      var y0 = top0 - t * s, y6 = y0 + 6 * s;
      if (y0 < -2 || y6 > h + 2) continue;
      var p = 0;
      for (var a = 1; a <= t; a++) p += cerca(mejor.frac, top0 - a * s, 3, s);
      for (var b = 1; b <= falta - t; b++) p += cerca(mejor.frac, mejor.cad[mejor.cad.length - 1] + b * s, 3, s);
      if (p > puntos) { puntos = p; elegido = t; }
    }
    if (puntos < 0) return null;
    var y0f = top0 - elegido * s;
    /* bordes izquierdo y derecho: donde empieza y acaba lo oscuro en las líneas */
    var izq = [], der = [], d = img.data;
    mejor.cad.forEach(function (yc) {
      var y = Math.round(yc), o = y * w * 4, a = -1, b = -1;
      for (var x = 0; x < w; x++) if (lum(d, o + x * 4) < mejor.umbral) { if (a < 0) a = x; b = x; }
      if (a >= 0) { izq.push(a); der.push(b); }
    });
    izq.sort(function (p, q) { return p - q; }); der.sort(function (p, q) { return p - q; });
    var x0 = izq[Math.floor(izq.length / 2)], x1 = der[Math.floor(der.length / 2)];
    if (x1 - x0 < w * 0.5) return null;
    return { x0: x0, x1: x1, y0: y0f, y1: y0f + 6 * s };
  }

  function colorCasilla(img, r) {
    var w = img.width, d = img.data, R = 0, G = 0, B = 0, n = 0;
    var xa = Math.round(r.x + r.w * 0.15), xb = Math.round(r.x + r.w * 0.85);
    var ya = Math.round(r.y + r.h * 0.45), yb = Math.round(r.y + r.h * 0.9);
    for (var y = ya; y < yb; y++) for (var x = xa; x < xb; x++) {
      if (x < 0 || y < 0 || x >= w || y >= img.height) continue;
      var i = (y * w + x) * 4; if (lum(d, i) < 140) continue; // letras
      R += d[i]; G += d[i + 1]; B += d[i + 2]; n++;
    }
    if (!n) return null;
    return [R / n, G / n, B / n];
  }
  function clasificar(c) {
    if (!c) return "";
    var r = c[0] / 255, g = c[1] / 255, b = c[2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    var sat = mx ? (mx - mn) / mx : 0;
    if (sat < 0.07) return "";
    var hue;
    if (mx === r) hue = 60 * (((g - b) / (mx - mn)) % 6);
    else if (mx === g) hue = 60 * ((b - r) / (mx - mn) + 2);
    else hue = 60 * ((r - g) / (mx - mn) + 4);
    if (hue < 0) hue += 360;
    if (hue >= 250 && hue <= 350) return "Di";
    if (hue >= 160 && hue < 215) return "N";
    if (hue >= 85 && hue < 160) return "M";
    return "";
  }

  /* devuelve 42 valores ("Di", "N", "M" o "") de arriba a abajo y de lunes a domingo */
  function leerCasillas(img, g) {
    var cw = (g.x1 - g.x0) / 7, ch = (g.y1 - g.y0) / 6, out = [];
    for (var f = 0; f < 6; f++) for (var c = 0; c < 7; c++)
      out.push(clasificar(colorCasilla(img, { x: g.x0 + c * cw, y: g.y0 + f * ch, w: cw, h: ch })));
    return out;
  }

  var api = { buscarCuadricula: buscarCuadricula, leerCasillas: leerCasillas, clasificar: clasificar };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else raiz.LectorTurnos = api;
})(this);
