from job_slug import generate_job_slug


def test_generate_job_slug_cases():
    cases = [
        ("Integration and Test Engineer", 354340, "integration-and-test-engineer-354340"),
        ("Developpeur Full-Stack / API", 42, "developpeur-full-stack-api-42"),
        ("Développeur Full-Stack / API", 42, "developpeur-full-stack-api-42"),
        ("工程師", 99, "job-99"),
        ("", 100, "job-100"),
        (None, 101, "job-101"),
        ("Senior $$$ Data Engineer!!!", 777, "senior-data-engineer-777"),
    ]
    for title, db_id, expected in cases:
        assert generate_job_slug(title, db_id) == expected


def test_long_title_preserves_id_suffix():
    slug = generate_job_slug(" ".join(["Principal"] * 40), 123456, 80)
    assert len(slug) <= 80
    assert slug.endswith("-123456")


def test_db_id_is_required():
    try:
        generate_job_slug("Engineer", None)
        raise AssertionError("expected ValueError for None db_id")
    except ValueError:
        pass

    try:
        generate_job_slug("Engineer", "abc")
        raise AssertionError("expected ValueError for non-numeric db_id")
    except ValueError:
        pass


if __name__ == "__main__":
    test_generate_job_slug_cases()
    test_long_title_preserves_id_suffix()
    test_db_id_is_required()
    print("job slug Python tests passed")
