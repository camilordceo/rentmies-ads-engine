"""
Rentmies — Generador de Ads para Instagram
Genera 5 variaciones de copy + imagen 1080x1080 para propiedades en Colombia.
"""

import os
import base64
from pathlib import Path

import requests
from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image
import io

# ── Config ────────────────────────────────────────────────────────────────────

load_dotenv(r'C:\Users\camil\rentmies-growth-agents\adsplatform.env')

API_KEY = os.environ["GOOGLE_AI_API_KEY"]
OUTPUT_DIR = Path(__file__).parent / "output"
OUTPUT_DIR.mkdir(exist_ok=True)

client = genai.Client(api_key=API_KEY)

# ── Pain points reales de arrendatarios en Colombia ───────────────────────────

PAIN_POINTS = [
    "Llevas semanas buscando arriendo y todos los apartamentos buenos ya están tomados.",
    "El propietario tarda días en responder y pierdes la propiedad que te gustaba.",
    "Te piden depósito + mes adelantado + fiador y el presupuesto no alcanza.",
    "Visitaste 10 apartamentos y ninguno coincide con las fotos del anuncio.",
    "El proceso de aprobación es eterno y necesitas mudarte ya.",
]

# ── Generador de copy (Gemini 1.5 Flash) ──────────────────────────────────────

COPY_PROMPT_TEMPLATE = """
Eres el copywriter de Rentmies, startup de IA inmobiliaria en Colombia (Bogotá, Medellín, Cali).
Tono: moderno, directo, confiable. Sin jerga corporativa.

Pain point del arrendatario: "{pain_point}"

Escribe un ad para Instagram con este formato EXACTO (sin markdown, sin comillas extra):

HEADLINE: [máximo 8 palabras, gancho emocional directo]
DESCRIPCION: [máximo 20 palabras, solución concreta que ofrece Rentmies + CTA para WhatsApp]

Solo devuelve el HEADLINE y la DESCRIPCION, nada más.
"""

def generate_copy(pain_point: str) -> tuple[str, str]:
    response = client.models.generate_content(
        model="gemini-1.5-flash",
        contents=COPY_PROMPT_TEMPLATE.format(pain_point=pain_point),
        config=types.GenerateContentConfig(temperature=0.9),
    )
    text = response.text.strip()
    headline, descripcion = "", ""
    for line in text.splitlines():
        if line.upper().startswith("HEADLINE:"):
            headline = line.split(":", 1)[1].strip()
        elif line.upper().startswith("DESCRIPCION:"):
            descripcion = line.split(":", 1)[1].strip()
    return headline, descripcion


# ── Generador de imagen (Imagen 3 via REST) ───────────────────────────────────

IMAGE_PROMPT_TEMPLATE = (
    "Fotografía arquitectónica profesional de un apartamento moderno en {ciudad}, Colombia. "
    "Sala luminosa con grandes ventanales, decoración minimalista contemporánea, "
    "luz natural cálida, vista a la ciudad. Estilo editorial de revista de arquitectura. "
    "Sin personas, sin texto, sin logos, sin marcas de agua."
)

IMAGEN_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "imagen-3.0-generate-002:predict?key={api_key}"
)

CIUDADES = ["Bogotá", "Medellín", "Cali", "Bogotá", "Medellín"]

def generate_image(ciudad: str) -> Image.Image:
    url = IMAGEN_URL.format(api_key=API_KEY)
    payload = {
        "instances": [{"prompt": IMAGE_PROMPT_TEMPLATE.format(ciudad=ciudad)}],
        "parameters": {
            "sampleCount": 1,
            "aspectRatio": "1:1",
            "safetySetting": "block_only_high",
        },
    }
    response = requests.post(url, json=payload, timeout=60)
    response.raise_for_status()

    data = response.json()
    b64 = data["predictions"][0]["bytesBase64Encoded"]
    return Image.open(io.BytesIO(base64.b64decode(b64))).resize((1080, 1080), Image.LANCZOS)


# ── Pipeline principal ────────────────────────────────────────────────────────

def main():
    print("=" * 55)
    print("  RENTMIES — Generador de Ads Instagram")
    print("=" * 55)
    print(f"  Output: {OUTPUT_DIR}\n")

    results = []

    for i, (pain_point, ciudad) in enumerate(zip(PAIN_POINTS, CIUDADES), start=1):
        print(f"[{i}/5] Generando ad #{i}...")

        # Copy
        print(f"       Copy ({ciudad}) → ", end="", flush=True)
        headline, descripcion = generate_copy(pain_point)
        print(f'"{headline}"')

        # Imagen
        print(f"       Imagen → ", end="", flush=True)
        image = generate_image(ciudad)
        print("OK")

        # Guardar
        img_path = OUTPUT_DIR / f"ad_{i}.png"
        txt_path = OUTPUT_DIR / f"ad_{i}.txt"

        image.save(img_path, "PNG")
        txt_path.write_text(
            f"HEADLINE: {headline}\nDESCRIPCION: {descripcion}\n\nPAIN POINT: {pain_point}\n",
            encoding="utf-8",
        )

        results.append({"ad": i, "headline": headline, "descripcion": descripcion})
        print(f"       Guardado: ad_{i}.png + ad_{i}.txt\n")

    # Resumen
    print("=" * 55)
    print("  RESUMEN DE COPIES GENERADOS")
    print("=" * 55)
    for r in results:
        print(f"\n  Ad #{r['ad']}")
        print(f"  H: {r['headline']}")
        print(f"  D: {r['descripcion']}")

    print(f"\n  Archivos en: {OUTPUT_DIR}")
    print("=" * 55)


if __name__ == "__main__":
    main()
