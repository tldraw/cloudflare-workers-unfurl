# cloudflare-workers-unfurl

A tiny utility to get basic information about a URL on Cloudflare Workers using the built-in HTMLRewriter API.

## Usage

There are two exports: `unfurl` and `handleRequest`.

`unfurl` is the main function that does the work. It takes a URL and returns a promise that resolves to an object with the following properties:

- `title`: The title of the page
- `description`: The description of the page
- `image`: The URL of the social image
- `favicon`: The URL of the favicon

`handleRequest` is a function that takes a `Request` object and returns a promise that resolves to a `Response` object. It uses `unfurl` to get the information about the URL in the `url` query parameter of the request and returns it as JSON.

## License

MIT