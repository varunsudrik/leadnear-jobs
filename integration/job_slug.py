import re
import unicodedata


DEFAULT_MAX_LENGTH = 150


def slug_base(value):
    text = "" if value is None else str(value)
    normalized = unicodedata.normalize("NFKD", text)
    ascii_text = normalized.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", ascii_text.lower())
    return slug.strip("-")


def generate_job_slug(title, db_id, max_length=DEFAULT_MAX_LENGTH):
    db_id_text = "" if db_id is None else str(db_id).strip()
    if not re.fullmatch(r"\d+", db_id_text):
        raise ValueError("generate_job_slug requires a numeric db_id")

    suffix = f"-{db_id_text}"
    limit = max(len(suffix) + 3, int(max_length or DEFAULT_MAX_LENGTH))
    title_limit = limit - len(suffix)
    base = slug_base(title)

    if not base:
        return f"job{suffix}"
    if len(base) > title_limit:
        base = base[:title_limit].rstrip("-")

    return f"{base or 'job'}{suffix}"


if __name__ == "__main__":
    cases = [
        ("Integration and Test Engineer", 354340),
        ("Développeur Full-Stack / API", 42),
        ("工程師", 99),
        ("", 100),
        ("Senior $$$ Data Engineer!!!", 777),
    ]
    for title, db_id in cases:
        print(f"{db_id}\t{generate_job_slug(title, db_id)}")
