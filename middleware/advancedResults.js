const advancedResults = (model, populate, allowedFields = []) => async (req, res, next) => {
  let query;

  // Create a copy of req.query
  const reqQuery = { ...req.query };

  // Fields to exclude from filtering
  const removeFields = ['select', 'sort', 'page', 'limit'];

  // Loop over removeFields and delete them from reqQuery
  removeFields.forEach(param => delete reqQuery[param]);

  // Whitelist: only allow known filterable fields through
  const sanitizedQuery = {};
  if (allowedFields.length > 0) {
    for (const key of Object.keys(reqQuery)) {
      // Strip any MongoDB operator keys (e.g. $regex, $ne) from values
      const val = reqQuery[key];
      if (typeof val === 'object' && val !== null) {
        // Only allow gt/gte/lt/lte/in operators on whitelisted fields
        if (!allowedFields.includes(key)) continue;
        const cleanVal = {};
        for (const op of Object.keys(val)) {
          if (['gt', 'gte', 'lt', 'lte', 'in'].includes(op)) {
            cleanVal[`$${op}`] = val[op];
          }
        }
        if (Object.keys(cleanVal).length > 0) sanitizedQuery[key] = cleanVal;
      } else if (allowedFields.includes(key)) {
        sanitizedQuery[key] = val;
      }
    }
  } else {
    // Legacy fallback: no whitelist, but still sanitize operators
    let queryStr = JSON.stringify(reqQuery);
    queryStr = queryStr.replace(/\b(gt|gte|lt|lte|in)\b/g, match => `$${match}`);
    Object.assign(sanitizedQuery, JSON.parse(queryStr));
  }

  // Finding resource
  query = model.find(sanitizedQuery);

  // Select Fields — only allow alphanumeric field names
  if (req.query.select) {
    const fields = req.query.select.split(',').filter(f => /^[a-zA-Z0-9_.]+$/.test(f)).join(' ');
    if (fields) query = query.select(fields);
  }

  // Sort — only allow alphanumeric field names with optional leading '-'
  if (req.query.sort) {
    const sortBy = req.query.sort.split(',').filter(f => /^-?[a-zA-Z0-9_.]+$/.test(f)).join(' ');
    if (sortBy) query = query.sort(sortBy);
    else query = query.sort('-createdAt');
  } else {
    query = query.sort('-createdAt');
  }

  // Pagination
  const page = parseInt(req.query.page, 10) || 1;
  const limit = parseInt(req.query.limit, 10) || 25;
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const total = await model.countDocuments(JSON.parse(queryStr));

  query = query.skip(startIndex).limit(limit);

  // Populate if specified
  if (populate) {
    query = query.populate(populate);
  }

  // Executing query
  const results = await query;

  // Pagination result
  const pagination = {};

  if (endIndex < total) {
    pagination.next = {
      page: page + 1,
      limit
    };
  }

  if (startIndex > 0) {
    pagination.prev = {
      page: page - 1,
      limit
    };
  }

  res.advancedResults = {
    success: true,
    count: results.length,
    pagination,
    data: results
  };

  next();
};

export default advancedResults;
