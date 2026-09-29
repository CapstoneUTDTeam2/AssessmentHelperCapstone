import os
import requests
import pandas
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("NEBULALABS_API_KEY")
data={"first_name": "Jean", "last_name": "ValJean"}

r = requests.get(
    "https://api.utdnebula.com/professor",
    headers={"x-api-key": API_KEY},
    params=data
    )

result = r.json()

prof = result["data"][0]

print(prof["first_name"], prof["last_name"], prof["email"], prof["_id"])
print(prof)