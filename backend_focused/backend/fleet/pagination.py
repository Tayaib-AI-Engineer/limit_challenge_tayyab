from rest_framework.pagination import PageNumberPagination


class StandardPagination(PageNumberPagination):
    """Page size defaults to settings.PAGE_SIZE; clients may ask for more, up to a hard cap."""

    page_size_query_param = "page_size"
    max_page_size = 100
