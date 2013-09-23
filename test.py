def map(key, dims, value, context):
    context.write("/".join(dims), 1)

def reduce(key, values, context):
    context.write(key, sum(values))