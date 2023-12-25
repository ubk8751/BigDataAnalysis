FROM python:3.10
WORKDIR /app
COPY ./src/monitortool.py .
COPY ./requirements.txt .
COPY ./src/templates ./templates 
RUN pip install -r requirements.txt
EXPOSE 5000
