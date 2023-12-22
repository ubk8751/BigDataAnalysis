FROM python:3.10
WORKDIR /app
COPY ./src/monitortool.py .
COPY ./requirements.txt .
RUN mkdir -p /app/data && touch /app/data/data.csv
RUN pip install -r requirements.txt
CMD ["python3", "-u", "monitortool.py"]