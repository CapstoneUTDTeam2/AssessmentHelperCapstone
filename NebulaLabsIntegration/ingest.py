import os
import requests
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("NEBULALABS_API_KEY")
data={"first_name": "John", "last_name": "Cole"}

r = requests.get(
    "https://api.utdnebula.com/professor",
    headers={"x-api-key": API_KEY},
    params=data
    )

print(r.json())

