FROM python:3.10
WORKDIR /app
COPY ./requirements.txt .
RUN pip install -r requirements.txt
COPY ./src/monitortool.py .
COPY ./src/templates ./templates
RUN mkdir -p data && \
    touch data/final_state.txt data/files.csv data/chunks.csv data/candidates.csv data/expansions.csv data/clones.csv
EXPOSE 5000
