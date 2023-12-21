FROM python:3.10
WORKDIR /app
COPY ./src/monitortool.py .
COPY ./requirements.txt .
RUN pip install -r requirements.txt
CMD ["python3", "monitortool.py"]
