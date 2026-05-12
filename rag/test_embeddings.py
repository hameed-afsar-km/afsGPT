from langchain_ollama import OllamaEmbeddings

try:
    embeddings = OllamaEmbeddings(model="nomic-embed-text")
    res = embeddings.embed_query("Hello world")
    print("Embedding successful. Length:", len(res))
except Exception as e:
    print("Embedding error:", e)
