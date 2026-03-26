import requests, json, os, fitz, base64
from dotenv import load_dotenv

load_dotenv()
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

pdf_bytes = open("Pan sample.pdf", "rb").read()
document = fitz.open(stream=pdf_bytes, filetype="pdf")
content_list = [{"type": "text", "text": "What is in these images?"}]
for page in document:
    pixmap = page.get_pixmap(matrix=fitz.Matrix(1, 1), alpha=False)
    img_bytes = pixmap.tobytes("jpeg", 85)
    b64 = base64.b64encode(img_bytes).decode("utf-8")
    content_list.append({
        "type": "image_url",
        "image_url": {"url": f"data:image/jpeg;base64,{b64}"}
    })

data = {
    "model": "nvidia/nemotron-nano-12b-v2-vl:free",
    "messages": [{"role": "user", "content": content_list}],
    "temperature": 0.0
}
url = "https://openrouter.ai/api/v1/chat/completions"
headers = {"Authorization": f"Bearer {OPENROUTER_API_KEY}", "Content-Type": "application/json"}
response = requests.post(url, headers=headers, json=data)
print("Status Code:", response.status_code)
print("Response text:", response.text)
